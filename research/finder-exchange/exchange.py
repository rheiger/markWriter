"""Supervise one reversible same-path Quick Look provider trial on the QA Mac."""
import ctypes
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time

APP = Path("/Applications/MarkWriter.app")
EXT = Path("Contents/PlugIns/MarkWriterQuickLook.appex")
EXE = EXT / "Contents/MacOS/QuickLookPrototype"
PLUGIN = "com.markwriter.app.quicklook"
LS = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
TTL = 20 * 60


def require(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def command(*args, timeout=60):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


def identity(path):
    st = path.lstat()
    require(not path.is_symlink(), f"unexpected symbolic link: {path}")
    return [st.st_dev, st.st_ino]


def digest(file):
    with file.open("rb") as stream:
        value = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def write_json(path, data):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        json.dump(data, stream, sort_keys=True, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(stream.name, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def signature(path):
    data = subprocess.check_output(["/usr/bin/codesign", "-dv", "--verbose=4", path],
                                   text=True, stderr=subprocess.STDOUT)
    match = re.search(r"^CDHash=([0-9a-f]+)$", data, re.M)
    require(match is not None and "Signature=adhoc" in data.splitlines(), f"unexpected seal on {path}")
    return match.group(1)


def contents(app, version):
    command("/usr/bin/codesign", "--verify", "--strict", app / EXT)
    command("/usr/bin/codesign", "--verify", "--strict", "--deep", app)
    for bundle, identifier in [(app, "com.markwriter.app"), (app / EXT, PLUGIN)]:
        with (bundle / "Contents/Info.plist").open("rb") as stream:
            plist = plistlib.load(stream)
        require(plist["CFBundleIdentifier"] == identifier and
                plist["CFBundleShortVersionString"] == version, f"unexpected bundle {bundle}")
    return {"host_cdhash": signature(app), "extension_cdhash": signature(app / EXT),
            "host_sha256": digest(app / "Contents/MacOS/markwriter"),
            "extension_sha256": digest(app / EXE),
            "script_sha256": digest(app / EXT / "Contents/Resources/quicklook-render.js")}


def registration(session, name, version):
    result = command("/usr/bin/pluginkit", "-m", "-ADvv", "-i", PLUGIN)
    (session / (name + ".txt")).write_text(result + "\n")
    paths = re.findall(r"^\s*Path = (.+)$", result, re.M)
    uuids = re.findall(r"^\s*UUID = ([0-9A-Fa-f-]+)$", result, re.M)
    # The prior trial restored a default (unset) user election. Detect drift
    # without using an identifier-wide election to force Finder selection.
    default_line = re.escape(f"{PLUGIN}({version})")
    require(paths == [str(APP / EXT)] and len(uuids) == 1 and
            re.search(r"^\s*" + default_line + r"\s*$", result, re.M) and
            f"Parent Bundle = {APP}" in result and "SDK = com.apple.quicklook.preview" in result,
            f"unexpected provider listing or election: {name}.txt")
    return uuids[0]


def defaults(session, probe, phase):
    result = json.loads(command(probe, session / ("fixtures-" + phase)))
    require("example.md" in result and len(result) >= 44, "incomplete registration probe")
    rows = {}
    for name, item in result.items():
        # Redact default application paths from evidence.
        row = [item.get("contentType"), sorted(item["extensionTypes"]), item.get("defaultApplication")]
        rows[name] = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
    return rows


def proc_start(pid):
    try:
        return command("/bin/ps", "-p", str(pid), "-o", "lstart=")
    except subprocess.CalledProcessError:
        return ""


def pids(name):
    result = subprocess.run(["/usr/bin/pgrep", "-x", name], text=True, stdout=subprocess.PIPE)
    require(result.returncode in (0, 1), "pgrep error")
    return [int(pid) for pid in result.stdout.split()]


def ensure_editor_idle():
    require(not pids("markwriter"), "MarkWriter is running; save and quit in Finder, then retry")


def stop_extension():
    # Only act before each exchange, when this pathname still names this bundle.
    executable = APP / EXE
    inode = str(identity(executable)[1])
    for pid in pids("QuickLookPrototype"):
        start = proc_start(pid)
        if not start:
            continue
        listing = subprocess.run(["/usr/sbin/lsof", "-nP", "-a", "-p", str(pid), "-d", "txt", "-Fin"],
                                 text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if not proc_start(pid):
            continue
        require(listing.returncode == 0, f"cannot identify extension process {pid}")
        records = listing.stdout.split("\nftxt\n")[1:]
        if not any("n" + str(executable) in lines.splitlines() for lines in records):
            raise RuntimeError(f"another QuickLookPrototype is active ({pid}); close its preview")
        require(any("i" + inode in lines.splitlines() and "n" + str(executable) in lines.splitlines()
                    for lines in records), "running extension image differs from installed inode")
        path = command("/bin/ps", "-p", str(pid), "-o", "comm=")
        uid = command("/bin/ps", "-p", str(pid), "-o", "uid=")
        require(path == str(executable) and uid == str(os.getuid()) and proc_start(pid) == start,
                "extension PID verification failed")
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            continue
        for attempt in range(40):
            if proc_start(pid) != start:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("exact extension did not exit on TERM; close the preview and retry")


def exchange(left, right):
    # Darwin RENAME_SWAP exchanges both directory entries in one filesystem operation.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renamex_np
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    if rename(os.fsencode(left), os.fsencode(right), 0x00000002) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def side(session, data):
    ids = [identity(APP), identity(session / "holding")]
    before = [data["original_inode"], data["candidate_inode"]]
    if ids == before:
        return "original"
    require(ids == before[::-1], "bundle identities differ; preserved both paths for inspection")
    return "candidate"


def private_session(session):
    require(session.is_absolute() and session == session.resolve(), "use canonical absolute session path")
    require(session.is_dir() and session.stat().st_uid == os.getuid() and
            session.stat().st_mode & 0o077 == 0, "untrusted session owner or mode")


def prepare(session, dmg, sha, host_pin, extension_pin, probe):
    require(session.is_absolute() and session == session.resolve() and not session.exists(),
            "supply a new canonical absolute session directory (e.g. /private/tmp/... )")
    require(Path(probe).is_absolute() and os.access(probe, os.X_OK), "registration probe unavailable")
    require(dmg.is_file() and digest(dmg) == sha, "research DMG hash mismatch")
    original = contents(APP, "2.19.3")
    require((original["host_cdhash"], original["extension_cdhash"]) == (host_pin, extension_pin),
            "installed host/extension CDHash differs from pinned baseline")
    session.mkdir(mode=0o700)
    private_session(session)
    require(session.stat().st_dev == APP.stat().st_dev, "session must be on same volume as installed app")
    holding = session / "holding"
    mount = session / "mount"
    mount.mkdir()
    command("/usr/bin/hdiutil", "attach", "-readonly", "-nobrowse", "-noautoopen",
            "-mountpoint", mount, dmg)
    try:
        packaged = contents(mount / APP.name, "2.21.1")
        command("/usr/bin/ditto", mount / APP.name, holding)
        require(contents(holding, "2.21.1") == packaged, "copy differs from sealed candidate")
    finally:
        command("/usr/bin/hdiutil", "detach", mount)
    shutil.copyfile(probe, session / "probe")
    (session / "probe").chmod(0o700)
    baseline = defaults(session, session / "probe", "before")
    uuid = registration(session, "provider-before", "2.19.3")
    data = dict(phase="prepared", original=original, candidate=packaged, dmg_sha256=sha,
                original_inode=identity(APP), candidate_inode=identity(holding),
                original_uuid=uuid, defaults=baseline)
    write_json(session / "state.json", data)
    print("PREPARED", session, flush=True)


def register():
    command(LS, "-f", APP)
    command("/usr/bin/pluginkit", "-a", APP / EXT)


def remove_registration():
    command("/usr/bin/pluginkit", "-r", APP / EXT)


def restore(session, owner=None):
    with (session / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = json.loads((session / "state.json").read_text())
        if owner is not None and data.get("owner") != owner:
            return
        current = side(session, data)
        if data["phase"] in ("prepared", "restored"):
            require(current == "original", "journal and installed identity disagree")
            return
        if current == "candidate":
            ensure_editor_idle()
            require(contents(session / "holding", "2.19.3") == data["original"],
                    "preserved original seal/identity changed")
            stop_extension()
            remove_registration()
            exchange(APP, session / "holding")
        require(side(session, data) == "original" and contents(APP, "2.19.3") == data["original"],
                "failed to verify restored original")
        # An interrupted exchange may already have restored the original registration.
        try:
            uuid = registration(session, "provider-restored", "2.19.3")
        except (RuntimeError, subprocess.CalledProcessError):
            register()
            uuid = registration(session, "provider-restored", "2.19.3")
        suffix = "after-" + str(time.time_ns())
        observed = defaults(session, session / "probe", suffix)
        require(observed == data["defaults"], "synthetic default-app/type comparison differs")
        data.update(phase="restored", restored_uuid=uuid, uuid_changed=uuid != data["original_uuid"])
        write_json(session / "state.json", data)
        print(f"RESTORED uuid={uuid} uuid_changed={data['uuid_changed']}", flush=True)


def watch(session, owner, start):
    deadline = time.monotonic() + TTL
    while time.monotonic() < deadline and proc_start(owner) == start:
        if json.loads((session / "state.json").read_text())["phase"] == "restored":
            return
        time.sleep(2)
    restore(session)


def start(session):
    with (session / "lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = json.loads((session / "state.json").read_text())
        require(data["phase"] == "prepared" and side(session, data) == "original", "session already used")
        require(contents(APP, "2.19.3") == data["original"] and
                contents(session / "holding", "2.21.1") == data["candidate"], "bundle verification failed")
        require(registration(session, "provider-prestart", "2.19.3") == data["original_uuid"],
                "baseline provider changed before start")
        ensure_editor_idle()
        with (session / "watchdog.log").open("a") as log:
            watcher = subprocess.Popen([sys.executable, Path(__file__).resolve(), "watch", session,
                                        str(os.getpid()), proc_start(os.getpid())],
                                       stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        try:
            data.update(phase="exchanging", watchdog_pid=watcher.pid, owner=os.getpid())
            write_json(session / "state.json", data)
            stop_extension()
            ensure_editor_idle()
            remove_registration()
            exchange(APP, session / "holding")
            register()
            data.update(phase="active", candidate_uuid=registration(session, "provider-candidate", "2.21.1"))
            require(contents(APP, "2.21.1") == data["candidate"], "installed candidate differs")
            write_json(session / "state.json", data)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
    print("READY", session, flush=True)
    # The shell must keep stdin open. A closed SSH session also releases ownership.
    while select.select([sys.stdin], [], [], 5)[0] == []:
        if json.loads((session / "state.json").read_text())["phase"] != "active":
            return
    # Every newline or EOF requests immediate restoration; no unaudited operation commands.


if __name__ == "__main__":
    require(sys.platform == "darwin" and os.getuid() != 0 and
            os.getuid() == os.stat("/dev/console").st_uid, "requires the non-root GUI console user")
    os.umask(0o077)
    action, raw_session, *args = sys.argv[1:]
    session = Path(raw_session)
    if action == "prepare":
        dmg, sha, host_pin, extension_pin, probe = args
        prepare(session, Path(dmg), sha, host_pin, extension_pin, probe)
    else:
        private_session(session)
        if action == "start":
            # A second prepared session can point at the same original inode.
            # Take the lock on that inode, through exchange and restoration.
            original_fd = os.open(APP, os.O_RDONLY)
            try:
                fcntl.flock(original_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                try:
                    start(session)
                finally:
                    restore(session, owner=os.getpid())
            finally:
                os.close(original_fd)
        elif action == "restore":
            restore(session)
        elif action == "watch":
            owner, start_stamp = args
            watch(session, int(owner), start_stamp)
        else:
            raise ValueError("expected prepare, start, restore, or watch")
