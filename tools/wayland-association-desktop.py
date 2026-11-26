"""Exercise the released DEB through a native-Wayland Nautilus window.

Input and screenshots come from the disposable GNOME Shell Wayland compositor.
The focus observer records which native surface has keyboard focus.
"""

import csv
import io
import json
import re
import subprocess
import time

import gi

gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, Gio, GLib
from PIL import Image

desktop = __import__("ubuntu-association-desktop")

(EVIDENCE, INCUMBENT, MARKWRITER, MIME, ROOT, command, dirty_checkpoint,
 documents, mime_state, observe, wait, workspace) = (
    desktop.EVIDENCE, desktop.INCUMBENT, desktop.MARKWRITER, desktop.MIME, desktop.ROOT,
    desktop.command, desktop.dirty_checkpoint,
    desktop.documents, desktop.mime_state, desktop.observe,
    desktop.wait, desktop.workspace,
)


class WaylandSeat:
    """Keep the RemoteDesktop session attached to one private D-Bus connection."""

    shell_name = "org.gnome.Shell"
    observer_path = "/com/markwriter/WaylandTest"
    observer_interface = "com.markwriter.WaylandTest"
    remote_desktop = "org.gnome.Mutter.RemoteDesktop"

    def __init__(self):
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self.path = self.call(self.remote_desktop, "/org/gnome/Mutter/RemoteDesktop",
                              self.remote_desktop, "CreateSession")[0]
        self.input("Start")
        # Bind both virtual devices before GTK clients enumerate the Wayland seat.
        self.input("NotifyPointerMotionRelative", "(dd)", 1.0, 1.0)
        self.key("Shift_L")

    def call(self, destination, path, interface, method, signature=None, *values):
        arguments = GLib.Variant(signature, values) if signature else None
        return self.bus.call_sync(destination, path, interface, method, arguments, None,
                                  Gio.DBusCallFlags.NONE, 3000, None).unpack()

    def input(self, method, signature=None, *values):
        self.call(self.remote_desktop, self.path, f"{self.remote_desktop}.Session",
                  method, signature, *values)

    def observer(self, method):
        return self.call(self.shell_name, self.observer_path, self.observer_interface, method)

    def key(self, *names):
        symbols = [Gdk.keyval_from_name(name) for name in names]
        for symbol in symbols:
            self.input("NotifyKeyboardKeysym", "(ub)", symbol, True)
        for symbol in reversed(symbols):
            self.input("NotifyKeyboardKeysym", "(ub)", symbol, False)
        time.sleep(0.12)

    def type_text(self, value):
        for char in value:
            symbol = Gdk.unicode_to_keyval(ord(char))
            self.input("NotifyKeyboardKeysym", "(ub)", symbol, True)
            self.input("NotifyKeyboardKeysym", "(ub)", symbol, False)
        time.sleep(0.15)

    def move(self, x, y):
        for _ in range(5):
            old_x, old_y = self.observer("Pointer")
            if (old_x, old_y) == (x, y):
                return
            self.input("NotifyPointerMotionRelative", "(dd)", x - old_x, y - old_y)
            time.sleep(0.2)
        raise RuntimeError(f"Pointer did not reach {(x, y)}. Last position {(old_x, old_y)}.")

    def click(self, button=272):
        self.input("NotifyPointerButton", "(ib)", button, True)
        time.sleep(0.12)
        self.input("NotifyPointerButton", "(ib)", button, False)
        time.sleep(0.25)


def screenshot(label):
    path = EVIDENCE / f"{label}.png"
    path.write_bytes(bytes(seat.observer("Capture")[0]))
    return path


def visible_point(pattern, label, region=None):
    def find():
        frame = screenshot(label)
        enlarged = EVIDENCE / f"{label}-ocr-input.png"
        with Image.open(frame) as source:
            left, top, _, _ = region or (0, 0, source.width, source.height)
            area = source.crop(region) if region else source
            size = (area.width * 2, area.height * 2)
            area.convert("L").resize(size, Image.Resampling.LANCZOS).save(enlarged)
        data = command("tesseract", str(enlarged), "stdout", "--psm", "11", "tsv")
        lines = {}
        for row in csv.DictReader(io.StringIO(data), delimiter="\t"):
            if row["text"]:
                key = tuple(row[field] for field in ("block_num", "par_num", "line_num"))
                lines.setdefault(key, []).append(row)
        for words in lines.values():
            if re.fullmatch(pattern, " ".join(word["text"] for word in words), re.IGNORECASE):
                first = words[0]
                return (left + (2 * int(first["left"]) + int(first["width"])) // 4,
                        top + (2 * int(first["top"]) + int(first["height"])) // 4)
        return None

    return wait(f"visible {label} matching {pattern}", find, 12)


def focus_history():
    return json.loads((EVIDENCE / "focus.json").read_text())


def current_focus():
    return focus_history()[-1]


def is_editor(window):
    return window and "markwriter" in f"{window.get('title')} {window.get('app')}".lower()


def is_files(window):
    return window and "nautilus" in (window.get("app") or "").lower()


def raise_files():
    if not is_files(current_focus()):
        seat.key("Alt_L", "Tab")
    focus = wait("native Wayland Nautilus in foreground", lambda: (
        current_focus() if is_files(current_focus()) else None
    ))
    assert focus["wayland"], focus


def launch_files(directory, label):
    with (EVIDENCE / f"{label}-files.log").open("w") as log:
        subprocess.Popen(["nautilus", "--new-window", str(directory)], stdout=log, stderr=log)
    time.sleep(2)
    screenshot(f"{label}-startup")
    if not is_files(current_focus()):
        seat.key("Escape")
        seat.key("Alt_L", "Tab")
    focused = wait(f"Nautilus opened {directory.name}", lambda: (
        current_focus() if is_files(current_focus()) else None
    ))
    assert focused["wayland"], focused


def click_label(pattern, label, region=None):
    x, y = visible_point(pattern, label, region)
    seat.move(x, y)
    seat.click()


def forwarded_activations():
    trace = (ROOT / "handoff-dbus.log").read_text()
    return re.findall(r'string "activation-token"\s+variant\s+string "([^"]+)"', trace)


def activation_requested(tokens):
    trace = (ROOT / "wayland-server.log").read_text(errors="replace")
    return any(f'.activate("{token}",' in trace for token in tokens)


def dispatch(path, label, check, *, multiple=False):
    raise_files()
    x, y = visible_point(re.escape(path.name), f"{label}-file")
    seat.move(x, y - 52)
    seat.click()
    if multiple:
        seat.key("Control_L", "a")
    seat.click(273)
    screenshot(f"{label}-context")
    click_label(r".*Open With(?:\s|[.…])*", f"{label}-context-ocr")
    title = r"Open (?:[0-9]+ )?(?:Files?|Items?)"
    title_x, title_y = visible_point(title, f"{label}-chooser")
    seat.type_text("MarkWriter")
    # Restrict the match to the app list. The background editor title and
    # the chooser's own search field can both say MarkWriter.
    app_list = (title_x - 160, title_y + 105, title_x + 205, title_y + 410)
    click_label(r".*\bMark\s*Writer\b.*", f"{label}-chooser-app", app_list)
    # Filtering can resize and recenter the chooser. Read its updated title row
    # before pressing the adjacent confirmation button.
    title_x, title_y = visible_point(title, f"{label}-chooser-confirm")
    seat.move(title_x + 175, title_y)
    before = current_focus()
    assert is_files(before), before
    token_count = len(forwarded_activations())
    dispatched_at = time.monotonic()
    seat.click()
    result = wait(f"{label} delivery", check)
    time.sleep(2)
    after = current_focus()
    transitions = [window for window in focus_history() if window["time"] >= dispatched_at]
    screenshot(f"{label}-result")
    tokens = forwarded_activations()[token_count:]
    phase = {
        "sentWithFilesFocused": True,
        "delivered": True,
        "activationTokenForwarded": bool(tokens),
        "compositorActivationRequested": activation_requested(tokens),
        "editorEverFocused": any(is_editor(window) for window in transitions),
        "editorInForeground": bool(is_editor(after)),
        "focusBefore": before,
        "focusAfter": after,
        "focusTransitions": transitions,
    }
    (EVIDENCE / f"{label}.json").write_text(json.dumps(phase, indent=2) + "\n")
    return result, phase


def install_incumbent():
    desktop = ROOT / "data/applications" / INCUMBENT
    desktop.write_text("[Desktop Entry]\nType=Application\nName=Association Control\n"
                       "Exec=/usr/bin/true %F\nMimeType=text/markdown;\nTerminal=false\n")
    command("update-desktop-database", str(desktop.parent))
    command("gio", "mime", MIME, INCUMBENT)


def audit():
    baseline = mime_state()
    assert baseline["default"] == INCUMBENT and MARKWRITER in baseline["recommended"], baseline

    originals = {
        ROOT / "wayland-documents/Owner.md": b"WaylandOwnerSentinel\n",
        ROOT / "wayland-documents/Warm.md": b"WaylandWarmSentinel\n",
        ROOT / "wayland-batch/First.md": b"WaylandBatchFirstSentinel\n",
        ROOT / "wayland-batch/Second.md": b"WaylandBatchSecondSentinel\n",
    }
    first, second, batch_first, batch_second = originals
    for path, content in originals.items():
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(content)
        file_info = Gio.File.new_for_path(str(path)).query_info(
            "standard::content-type", Gio.FileQueryInfoFlags.NONE, None)
        assert file_info.get_content_type() == MIME, (path, file_info.get_content_type())

    mtimes = {path: path.stat().st_mtime_ns for path in originals}
    launch_files(first.parent, "main")
    owner, cold = dispatch(first, "cold", lambda: observe(first))
    assert owner["content"].encode() == originals[first]
    if not cold["editorInForeground"]:
        seat.key("Alt_L", "Tab")
        wait("cold editor manually focused", lambda: is_editor(current_focus()))
    editor_focus = current_focus()
    assert editor_focus["wayland"], editor_focus
    click_label(r"WaylandOwnerSentinel", "cold-editor-source")
    seat.key("End")
    seat.type_text(" dirty-draft")
    draft = wait("dirty recovery checkpoint", lambda: dirty_checkpoint(first))

    warm, warm_focus = dispatch(second, "warm", lambda: observe(second))
    assert warm["content"].encode() == originals[second]
    wait("different active tab before dirty reopen", lambda: workspace()["activeId"] == warm["id"])
    _, dirty_reopen = dispatch(first, "dirty-reopen", lambda: workspace()["activeId"] == owner["id"])
    raise_files()
    seat.key("Control_L", "l")
    seat.type_text(str(batch_first.parent))
    seat.key("Return")
    time.sleep(0.5)
    opened, batch = dispatch(batch_first, "multiselect", lambda: (
        docs if all(docs := [observe(batch_first), observe(batch_second)]) else None
    ), multiple=True)
    for path, doc in zip((batch_first, batch_second), opened, strict=True):
        assert doc["content"].encode() == originals[path]

    owners = [doc for doc in documents() if doc.get("path") == str(first)]
    assert len(owners) == 1
    assert owners[0]["id"] == owner["id"] and owners[0]["isDirty"]
    assert owners[0]["content"] == draft["content"]
    assert owners[0]["savedContent"].encode() == originals[first]
    for path, content in originals.items():
        assert path.read_bytes() == content and path.stat().st_mtime_ns == mtimes[path]
    assert mime_state()["default"] == baseline["default"], mime_state()
    for phase in (warm_focus, dirty_reopen, batch):
        if phase["editorInForeground"]:
            assert phase["focusAfter"]["pid"] == editor_focus["pid"], phase
    return {
        "compositor": "GNOME Shell headless Wayland",
        "nativeWaylandClients": True,
        "coldOpen": cold,
        "warmOpen": warm_focus,
        "dirtyReopen": dirty_reopen,
        "multiselect": {**batch, "paths": [batch_first.name, batch_second.name]},
        "dirtyOwnerPreserved": True,
        "sourceBytesAndTimestampsPreserved": True,
        "defaultBefore": baseline["default"],
        "defaultAfter": mime_state()["default"],
    }


if __name__ == "__main__":
    seat = WaylandSeat()
    trace = ROOT / "handoff-dbus.log"
    # Keep opaque activation tokens in the disposable profile. The retained
    # receipt records their presence without including the token values.
    with trace.open("w") as output:
        monitor = subprocess.Popen([
            "dbus-monitor", "--session",
            "type='method_call',interface='org.freedesktop.Application',"
            "path_namespace='/com/markwriter/app/Shell'",
        ], stdout=output)
    try:
        wait("private handoff monitor", lambda: "member=NameAcquired" in trace.read_text())
        install_incumbent()
        result = audit()
        (EVIDENCE / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    except Exception:
        try:
            screenshot("failure")
        except GLib.Error:
            pass
        raise
    finally:
        monitor.terminate()
        monitor.wait(timeout=5)
