"""Capture one operator-controlled Finder interval on macOS. See --help."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import plistlib
import queue
import re
import signal
import subprocess
import sys
import threading
import time
import uuid

KEYS = ("timestamp", "processID", "processImagePath", "processImageUUID", "eventMessage")
STATES = re.compile(r"^request=([\da-fA-F-]{36}) (start|timeout|Fallback: renderer timed out|completed|fallback)(?: elapsed_ms=(\d+))?$")
PREDICATE = 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"'


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, text=True, timeout=8).strip()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_receipt(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def stamp(pid):
    command = Path(run("/bin/ps", "-p", str(pid), "-o", "comm=")).resolve()
    birth = run("/bin/ps", "-p", str(pid), "-o", "lstart=")
    if not birth:
        raise ValueError("Missing PID start time")
    return command, birth


def process_snapshot(executable):
    matches = []
    for line in run("/bin/ps", "-axo", "pid=,comm=").splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and parts[1] == str(executable):
            matches.append(int(parts[0]))
    return matches


def sample_rss(pid, executable, birth):
    # Reading the event and running ps take time. This is neither peak memory
    # nor memory at the exact instant a renderer writes its log message.
    try:
        rss = int(run("/bin/ps", "-p", str(pid), "-o", "rss="))
        return rss if stamp(pid) == (executable, birth) else None
    except (ValueError, subprocess.SubprocessError):
        return None


def signed_identity(pid, executable, requirement):
    command, birth = stamp(pid)
    if command != executable:
        raise ValueError(f"Unexpected live executable {command}")
    evidence = run("/usr/bin/codesign", "--verify", "--verbose=1", "-R=" + requirement, str(pid))
    if stamp(pid) != (command, birth):
        raise ValueError("Process identity changed during signature check")
    return birth, evidence


def resume(pid, executable, birth):
    # A PID and command alone can refer to a later process after exit/relaunch.
    if stamp(pid) != (executable, birth):
        raise ValueError("PID no longer belongs to the paused process")
    os.kill(pid, signal.SIGCONT)


def induce_timeout(pid, executable, birth, out):
    # The independent process survives EOF, SSH disconnect, and parent termination.
    with (out / "resume-watchdog.txt").open("a") as log:
        guard = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "_resume", str(pid), str(executable), birth],
            stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    try:
        if stamp(pid) != (executable, birth):
            raise ValueError("Process identity changed before suspension")
        start = time.monotonic()
        os.kill(pid, signal.SIGSTOP)
        print(f"SUSPENDED pid={pid}", flush=True)
        time.sleep(8.25)
    finally:
        # Leave the watchdog armed if this resume fails.
        resume(pid, executable, birth)
        guard.terminate()
        guard.wait(timeout=3)
    return time.monotonic() - start


def read_stream(stream, messages):
    try:
        for line in stream:
            if line.startswith("{"):
                event = json.loads(line)
                if event.get("eventType") == "logEvent" and event.get("eventMessage"):
                    messages.put(event)
    except (ValueError, OSError) as error:
        messages.put(error)
    finally:
        messages.put(None)


def event_time(event):
    return datetime.datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))


def parse_event(event):
    match = STATES.fullmatch(event.get("eventMessage") or "")
    if not match:
        return None
    request, state, elapsed = match.groups()
    if state == "Fallback: renderer timed out":
        state = "timeout"
    if (state in ("completed", "fallback")) != (elapsed is not None):
        raise ValueError("Malformed elapsed time on renderer event")
    if type(event["processID"]) is not int or event["processID"] <= 0:
        raise ValueError("Invalid renderer PID")
    return str(uuid.UUID(request)), state, int(elapsed) if elapsed else None


def summarize(events, expected, image_uuid, case, identities, suspension):
    parsed = []
    for event in events:
        if event["processImagePath"] != str(expected) or str(event["processImageUUID"]).lower() != image_uuid:
            raise ValueError("Another provider or image UUID emitted renderer events in this interval")
        result = parse_event(event)
        if result is not None:
            parsed.append((event, *result))
    wanted = ["start", "timeout", "fallback"] if case == "timeout" else ["start", "completed"]
    if [state for _, _, state, _ in parsed] != wanted:
        raise ValueError("Expected " + ", ".join(wanted) + " once in order")
    first, request, _, _ = parsed[0]
    pid = first["processID"]
    if pid not in identities:
        raise ValueError("Missing live dynamic identity check")
    if any(item["processID"] != pid or key != request for item, key, _, _ in parsed):
        raise ValueError("Request UUID or PID changed")
    dates = [event_time(item) for item, *_ in parsed]
    if dates != sorted(dates):
        raise ValueError("Renderer timestamps out of order")
    if case == "timeout" and (not suspension or suspension["requestId"] != request or suspension["pid"] != pid):
        raise ValueError("Missing controlled suspension of this request")
    return {"requestId": request, "pid": pid, "states": wanted, "started": first["timestamp"],
            "ended": parsed[-1][0]["timestamp"], "elapsedMs": parsed[-1][-1]}


def capture(args):
    out = args.out.resolve()
    out.mkdir(mode=0o700)
    executable = (args.extension / "Contents/MacOS/QuickLookPrototype").resolve(strict=True)
    extension = executable.parents[2]
    info = plistlib.loads((extension / "Contents/Info.plist").read_bytes())
    if info.get("CFBundleIdentifier") != "com.markwriter.app.quicklook" or info.get("CFBundleExecutable") != executable.name:
        raise ValueError("Unexpected extension metadata")
    image_uuid = str(uuid.UUID(args.image_uuid))
    if not re.fullmatch(r"[0-9a-fA-F]{40}", args.cdhash):
        raise ValueError("Expected 40 hex characters in CDHash")
    requirement = f'cdhash H"{args.cdhash.lower()}"'
    seal = run("/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose=1", "-R=" + requirement, str(extension))
    images = run("/usr/bin/xcrun", "dwarfdump", "--uuid", str(executable))
    if not re.search(r"^UUID: " + re.escape(image_uuid) + r" \(arm64\)", images, re.IGNORECASE | re.MULTILINE):
        raise ValueError("Unexpected arm64 Mach-O UUID")
    fixture = args.fixture.resolve(strict=True)
    if fixture.suffix.lower() not in (".md", ".markdown") or not fixture.is_file():
        raise ValueError("Expected one synthetic Markdown fixture")
    siblings = [file for file in fixture.parent.iterdir() if file.is_file() and file.suffix.lower() in (".md", ".markdown")]
    if siblings != [fixture]:
        raise ValueError("Use a dedicated case folder containing only the one Markdown fixture")
    baseline = sha256(fixture)
    report = {"case": args.case, "fixture": fixture.name, "fixtureSha256": baseline, "extension": str(extension),
              "cdhash": args.cdhash.lower(), "imageUuid": image_uuid, "staticSeal": seal,
              "executableSha256": sha256(executable), "scriptSha256": sha256(extension / "Contents/Resources/quicklook-render.js"),
              "initialExactPathPids": process_snapshot(executable), "identities": {}, "suspension": None,
              "extensionRssSamplesKiB": [], "rssScope": "Live ps sample while processing an event; excludes WebKit children.",
              "correlated": False,
              "scope": "Operator must independently identify the visible Finder fixture and result."}
    write_receipt(out / "result.json", report)
    events = []
    messages = queue.Queue()
    stop_at = None
    try:
        with (out / "renderer.ndjson").open("x") as records, (out / "stream.stderr").open("x") as errors:
            stream = subprocess.Popen(["/usr/bin/log", "stream", "--level", "info", "--style", "ndjson",
                                       "--predicate", PREDICATE], stdout=subprocess.PIPE, stderr=errors, text=True)
            try:
                threading.Thread(target=read_stream, args=(stream.stdout, messages), daemon=True).start()
                time.sleep(1)
                if stream.poll() is not None:
                    raise ValueError("Unified log stream exited before arming")
                if not messages.empty():
                    raise ValueError("Unexpected renderer activity before READY; retry with a quiet interval")
                report["readyUtc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                write_receipt(out / "result.json", report)
                print(f"READY case={args.case} fixture={fixture} stop={out / 'stop'}", flush=True)
                end = time.monotonic() + args.wait_seconds
                while True:
                    now = time.monotonic()
                    if stop_at is None and (out / "stop").exists():
                        stop_at = now + 1
                    if stop_at is not None and now >= stop_at and messages.empty():
                        break
                    if now >= end:
                        raise TimeoutError("No operator stop before bounded capture deadline")
                    try:
                        event = messages.get(timeout=0.1)
                    except queue.Empty:
                        continue
                    if event is None or isinstance(event, Exception):
                        raise ValueError(f"Log stream ended unexpectedly: {event}")
                    item = {key: event.get(key) for key in KEYS}
                    events.append(item)
                    records.write(json.dumps(item) + "\n")
                    records.flush()
                    if item["processImagePath"] != str(executable) or str(item["processImageUUID"]).lower() != image_uuid:
                        raise ValueError("Renderer event from another executable or UUID; see renderer.ndjson")
                    result = parse_event(item)
                    if result is None:
                        continue
                    pid = item["processID"]
                    if result[1] != "start":
                        identity = report["identities"].get(pid)
                        if identity and result[1] in ("completed", "fallback"):
                            report["extensionRssSamplesKiB"].append({
                                "pid": pid, "afterEvent": result[1], "rssKiB": sample_rss(pid, executable, identity["birth"])})
                        continue
                    birth, evidence = signed_identity(pid, executable, requirement)
                    report["identities"][pid] = {"birth": birth, "dynamicVerification": evidence}
                    report["extensionRssSamplesKiB"].append({
                        "pid": pid, "afterEvent": "start", "rssKiB": sample_rss(pid, executable, birth)})
                    if args.case == "timeout" and report["suspension"] is None:
                        seconds = induce_timeout(pid, executable, birth, out)
                        report["suspension"] = {"requestId": result[0], "pid": pid, "seconds": seconds}
                    write_receipt(out / "result.json", report)
            finally:
                stream.terminate()
                stream.wait(timeout=4)
        report["request"] = summarize(events, executable, image_uuid, args.case, report["identities"], report["suspension"])
        if sha256(fixture) != baseline:
            raise ValueError("Fixture bytes changed during observation")
        report["correlated"] = True
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        write_receipt(out / "result.json", report)
    print(json.dumps(report["request"]), flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 5 and sys.argv[1] == "_resume":
        time.sleep(13)
        resume(int(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
        print("Watchdog resumed the original process", flush=True)
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--extension", type=Path, required=True)
        parser.add_argument("--cdhash", required=True)
        parser.add_argument("--image-uuid", required=True)
        parser.add_argument("--case", choices=("sequence", "class", "rejected", "oversized", "timeout", "recovery"), required=True)
        parser.add_argument("--fixture", type=Path, required=True)
        parser.add_argument("--out", type=Path, required=True, help="New directory. After the observation, create an empty file named stop in it.")
        parser.add_argument("--wait-seconds", type=int, default=420)
        capture(parser.parse_args())
