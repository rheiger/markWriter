"""Exercise the released DEB through a native-Wayland Nautilus window.

X11 input and screenshots target only the Devkit's outer display. The GNOME
Shell observer records which actual child surface has keyboard focus.
"""

import json
import subprocess
import time

from gi.repository import Gio

desktop = __import__("ubuntu-association-desktop")

(EVIDENCE, INCUMBENT, MARKWRITER, MIME, ROOT, command, dirty_checkpoint,
 documents, mime_state, observe, visible_point, wait, workspace) = (
    desktop.EVIDENCE, desktop.INCUMBENT, desktop.MARKWRITER, desktop.MIME, desktop.ROOT,
    desktop.command, desktop.dirty_checkpoint,
    desktop.documents, desktop.mime_state, desktop.observe, desktop.visible_point,
    desktop.wait, desktop.workspace,
)


def input_event(*args):
    command("xdotool", *args)


def screenshot(label):
    target = EVIDENCE / f"{label}.png"
    target.unlink(missing_ok=True)
    command("scrot", str(target))
    return target


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
        input_event("key", "alt+Tab")
    focus = wait("native Wayland Nautilus in foreground", lambda: (
        current_focus() if is_files(current_focus()) else None
    ))
    assert focus["wayland"], focus


def launch_files(directory, label):
    with (EVIDENCE / f"{label}-files.log").open("w") as log:
        subprocess.Popen(["nautilus", "--new-window", str(directory)], stdout=log, stderr=log)
    focused = wait(f"Nautilus opened {directory.name}", lambda: (
        current_focus() if current_focus().get("title") == directory.name else None
    ))
    assert focused["wayland"], focused


def click_label(pattern, label):
    x, y = visible_point(pattern, EVIDENCE / f"{label}.png")
    input_event("mousemove", str(x), str(y), "click", "1")


def dispatch(path, label, check, *, multiple=False):
    raise_files()
    if multiple:
        input_event("key", "ctrl+a")
    else:
        input_event("key", "ctrl+s")
        input_event("type", "--clearmodifiers", path.name)
        input_event("key", "Return")
    input_event("sleep", "0.25", "key", "shift+F10")
    screenshot(f"{label}-context")
    click_label(r".*Open With(?:\s|[.…])*", f"{label}-context-ocr")
    screenshot(f"{label}-chooser")
    input_event("type", "--clearmodifiers", "MarkWriter")
    click_label(r"[^a-z0-9]*Mark\s*Writer[^a-z0-9]*", f"{label}-chooser-ocr")
    before = current_focus()
    assert is_files(before), before
    dispatched_at = time.monotonic()
    input_event("key", "Return")
    result = wait(f"{label} delivery", check)
    time.sleep(2)
    after = current_focus()
    transitions = [window for window in focus_history() if window["time"] >= dispatched_at]
    screenshot(f"{label}-result")
    return result, {
        "sentWithFilesFocused": True,
        "delivered": True,
        "editorEverFocused": any(is_editor(window) for window in transitions),
        "editorInForeground": bool(is_editor(after)),
        "focusBefore": before,
        "focusAfter": after,
        "focusTransitions": transitions,
    }


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
        input_event("key", "alt+Tab")
        wait("cold editor manually focused", lambda: is_editor(current_focus()))
    editor_focus = current_focus()
    assert editor_focus["wayland"], editor_focus
    input_event("key", "ctrl+Home", "key", "End", "type", "--clearmodifiers", " dirty-draft")
    draft = wait("dirty recovery checkpoint", lambda: dirty_checkpoint(first))

    warm, warm_focus = dispatch(second, "warm", lambda: observe(second))
    assert warm["content"].encode() == originals[second]
    wait("different active tab before dirty reopen", lambda: workspace()["activeId"] == warm["id"])
    _, dirty_reopen = dispatch(first, "dirty-reopen", lambda: workspace()["activeId"] == owner["id"])
    raise_files()
    input_event("key", "ctrl+l")
    input_event("type", "--clearmodifiers", str(batch_first.parent))
    input_event("key", "Return", "sleep", "0.5")
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
    return {
        "compositor": "GNOME Shell Devkit Wayland",
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
    try:
        install_incumbent()
        result = audit()
        (EVIDENCE / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))
    except Exception:
        screenshot("failure")
        raise
