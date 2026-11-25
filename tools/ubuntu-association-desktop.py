"""Drive the installed application from Nautilus in a disposable X11 session."""
import csv
import io
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

from gi.repository import Gio
import pyatspi

MIME = "text/markdown"
MARKWRITER = "MarkWriter.desktop"
INCUMBENT = "markwriter-test-incumbent.desktop"
ROOT = Path(os.environ["MARKWRITER_ASSOCIATION_ROOT"])
EVIDENCE = Path(os.environ["MARKWRITER_ASSOCIATION_EVIDENCE"])


def command(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def wait(description, check, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            result = check()
            if result:
                return result
        except (LookupError, OSError, RuntimeError, json.JSONDecodeError, subprocess.CalledProcessError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f"Timed out waiting for {description}")


def descendants(node):
    yield node
    for child in node:
        yield from descendants(child)


def editable_fixture(text):
    for node in descendants(pyatspi.Registry.getDesktop(0)):
        state = node.getState()
        if not state.contains(pyatspi.STATE_SHOWING) or not state.contains(pyatspi.STATE_EDITABLE):
            continue
        try:
            accessible_text = node.queryText()
            if text in accessible_text.getText(0, accessible_text.characterCount):
                return node
        except NotImplementedError:
            continue
    return None


def click_in(window, node, button="1"):
    x, y, width, height = node.queryComponent().getExtents(pyatspi.WINDOW_COORDS)
    assert width > 0 and height > 0
    command("xdotool", "mousemove", "--window", window, str(x + width // 2), str(y + height // 2),
            "click", button)


def window_id(name):
    return command("xdotool", "search", "--onlyvisible", "--name", name).splitlines()[-1]


def editor_window():
    return command("xdotool", "search", "--onlyvisible", "--class", r"^markwriter$").splitlines()[-1]


def visible_point(pattern, screenshot, region=None, *, disappear=False, adjacent_open_rows=False):
    # GTK4 versions that do not expose the app chooser's rows through AT-SPI
    # still render those labels. Match actual visible text and retain that frame.
    def find():
        screenshot.unlink(missing_ok=True)
        arguments = ["scrot"]
        if region:
            arguments.extend(("--autoselect", ",".join(str(value) for value in region)))
        command(*arguments, str(screenshot))
        rows = csv.DictReader(io.StringIO(command("tesseract", str(screenshot), "stdout",
                                                "--psm", "6" if region else "11", "tsv")), delimiter="\t")
        lines = {}
        for row in rows:
            if row["text"]:
                key = tuple(row[column] for column in ("block_num", "par_num", "line_num"))
                lines.setdefault(key, []).append(row)
        if adjacent_open_rows:
            # Tesseract can split "With..." from "Open". Pair the aligned
            # first words of the top two actions in the same context menu.
            entries = sorted(
                (int(words[0]["left"]), int(words[0]["top"]), int(words[0]["width"]),
                 int(words[0]["height"]))
                for words in lines.values() if words[0]["text"].casefold() == "open"
            )
            for x, y, width, height in entries:
                if any(abs(x - earlier_x) <= 5 and 22 <= y - earlier_y <= 45
                       for earlier_x, earlier_y, _, _ in entries):
                    return x + width // 2, y + height // 2
        for words in lines.values():
            label = " ".join(word["text"] for word in words)
            if re.fullmatch(pattern, label, re.IGNORECASE):
                first = words[0]
                return int(first["left"]) + int(first["width"]) // 2, int(first["top"]) + int(first["height"]) // 2
        return None

    if disappear:
        wait(f"{pattern} from the closed dialog", lambda: find() is None, 12)
        return None
    x, y = wait(pattern, find, 12)
    if region:
        x, y = x + region[0], y + region[1]
    return x, y


def click_visible_text(pattern, screenshot, region=None):
    x, y = visible_point(pattern, screenshot, region)
    command("xdotool", "mousemove", str(x), str(y), "click", "1")


def select_pattern(window, pattern):
    # GTK versions expose Nautilus grid items with different AT-SPI roles.
    # Select by the ASCII fixture prefix in Nautilus's own pattern dialog.
    command("xdotool", "windowactivate", "--sync", window)
    command("xdotool", "key", "ctrl+s")
    visible_point(r".*Select Items Matching.*", EVIDENCE / "select-pattern.png")
    command("xdotool", "type", "--clearmodifiers", pattern)
    command("xdotool", "key", "Return")
    visible_point(r".*Select Items Matching.*", EVIDENCE / "selection.png", disappear=True)


def choose_markwriter(window, path, label, multiple=False):
    pattern = "*" if multiple else path.name.split(maxsplit=1)[0] + " *"
    select_pattern(window, pattern)
    command("xdotool", "key", "Shift+F10")
    x, y = visible_point(r"Open With\s*(?:\.{1,3}|…)?", EVIDENCE / f"{label}-context.png",
                         adjacent_open_rows=True)
    command("xdotool", "mousemove", str(x), str(y), "click", "1")
    dialog = wait("Open File dialog", lambda: window_id(r"^Open File"))
    command("scrot", "--window", dialog, str(EVIDENCE / f"{label}-chooser.png"))
    if mime_state()["default"] != MARKWRITER:
        geometry = dict(line.split("=") for line in
                        command("xdotool", "getwindowgeometry", "--shell", dialog).splitlines())
        x, y, width, height = (int(geometry[key]) for key in ("X", "Y", "WIDTH", "HEIGHT"))
        # Exclude the icons so adjacent letter strokes do not merge into them.
        click_visible_text(r"[^a-z0-9]*Mark\s*Writer[^a-z0-9]*", EVIDENCE / f"{label}-chooser-labels.png",
                           (x + 74, y + 90, width - 90, height - 156))
    command("xdotool", "key", "Return")


def mime_state():
    default = Gio.AppInfo.get_default_for_type(MIME, False)
    return {
        "default": default.get_id() if default else None,
        "recommended": [app.get_id() for app in Gio.AppInfo.get_recommended_for_type(MIME)],
    }


def workspace():
    return json.loads((Path(os.environ["MARKWRITER_PROFILE_DIR"]) / "workspace.json").read_text())


def documents():
    state = workspace()
    return state["documents"] + [
        doc for window in state.get("windows", []) for doc in window["workspace"]["documents"]
    ]


def observe(path):
    return next((doc for doc in documents() if doc.get("path") == str(path)), None)


def dirty_checkpoint(path):
    doc = observe(path)
    return doc if doc and doc["isDirty"] and "dirty-draft" in doc["content"] else None


def audit(mode):
    installed = mode in {"fresh", "existing"}
    mime = mime_state()
    assert (MARKWRITER in mime["recommended"] or mime["default"] == MARKWRITER) == installed, mime
    phase = {"associations": mime}
    if mode != "fresh":
        assert mime["default"] == INCUMBENT, mime
    if not installed:
        if mode == "rollback":
            process = subprocess.Popen(["/usr/bin/markwriter"])
            try:
                window = wait("rolled-back editor window", editor_window)
                assert int(command("xdotool", "getwindowpid", window)) == process.pid
                original_state = json.loads((EVIDENCE / "dirty-workspace.json").read_text())
                draft = next(doc for doc in original_state["documents"] if doc["isDirty"])
                restored = wait("rolled-back editor recovered dirty document", lambda: observe(Path(draft["path"])))
                assert all(restored[key] == draft[key] for key in ("id", "content", "savedContent", "isDirty"))
                phase["rolledBackEditorRecoveredDirtyOwner"] = True
            finally:
                process.terminate()
                process.wait(timeout=10)
        return phase

    directory = ROOT / "association-fixtures"
    directory.mkdir(exist_ok=True)
    first = directory / "A Grüße 文件.md"
    second = directory / "B Ångström sample.markdown"
    third = directory / "C café sample.md"
    fourth = directory / "D résumé sample.mkd"
    originals = {first: b"AssociationOwnerSentinel\n"}
    if mode == "existing":
        originals.update({second: b"AssociationSecondSentinel\n",
                          third: b"AssociationThirdSentinel\n", fourth: b"AssociationFourthSentinel\n"})
    for path, source in originals.items():
        path.write_bytes(source)
        info = Gio.File.new_for_path(str(path)).query_info(
            "standard::content-type", Gio.FileQueryInfoFlags.NONE, None)
        assert info.get_content_type() == MIME, (path.name, info.get_content_type())
    baseline = {path: path.stat().st_mtime_ns for path in originals}
    with (EVIDENCE / f"{mode}-nautilus.log").open("w") as log:
        subprocess.Popen(["nautilus", "--new-window", str(directory)], stdout=log, stderr=log)
    window = wait("Nautilus fixture window", lambda: window_id(r"^association-fixtures$"))
    if mode == "existing":
        select_pattern(window, "A *")
        command("xdotool", "key", "Return")
        log = ROOT / "incumbent-paths.txt"
        wait("double-click dispatch to the incumbent", lambda: log.read_text().strip() == str(first))
    choose_markwriter(window, first, mode)
    owner = wait("cold shell open of Unicode Markdown", lambda: observe(first))
    assert owner["content"].encode() == originals[first]
    phase["coldOpen"] = first.name

    if mode == "existing":
        # Edit the visible buffer in the installed WebView. Observe the dirty
        # checkpoint and active document before and after real shell dispatch.
        editor = wait("MarkWriter application window", editor_window)
        command("xdotool", "windowactivate", "--sync", editor)
        text = wait("editable fixture text", lambda: editable_fixture("AssociationOwnerSentinel"))
        if not text.queryComponent().grabFocus():
            click_in(editor, text)
        command("xdotool", "key", "End")
        command("xdotool", "type", "--clearmodifiers", " dirty-draft")
        draft = wait("dirty recovery checkpoint", lambda: dirty_checkpoint(first))
        choose_markwriter(window, second, "warm")
        second_doc = wait("warm shell open of .markdown", lambda: observe(second))
        assert second_doc["content"].encode() == originals[second]
        choose_markwriter(window, first, "reopen")
        wait("reopened dirty owner selected", lambda: workspace()["activeId"] == owner["id"])
        wait("reopened editor in the foreground", lambda: command("xdotool", "getactivewindow") == editor)
        choose_markwriter(window, first, "multiselect", multiple=True)
        for path in (third, fourth):
            opened = wait(f"{path.name} from one actual Nautilus multiselect", lambda: observe(path))
            assert opened["content"].encode() == originals[path]
        same_path = [doc for doc in documents() if doc.get("path") == str(first)]
        assert len(same_path) == 1
        assert same_path[0]["id"] == owner["id"] and same_path[0]["isDirty"]
        assert same_path[0]["content"] == draft["content"]
        assert same_path[0]["savedContent"].encode() == originals[first]
        phase.update({"incumbentDispatch": first.name, "warmOpen": second.name,
                      "dirtyOwnerPreserved": True, "actualMultiselect": [path.name for path in originals]})

    for path, source in originals.items():
        assert path.read_bytes() == source and path.stat().st_mtime_ns == baseline[path]
    phase["sourcePreserved"] = True
    assert mime_state()["default"] == mime["default"], mime_state()
    phase["defaultAfterOpenWith"] = mime_state()["default"]
    return phase


if __name__ == "__main__":
    mode = sys.argv[1]
    try:
        result = audit(mode)
        (EVIDENCE / f"{mode}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(result, ensure_ascii=False))
    except Exception:
        subprocess.run(["scrot", str(EVIDENCE / f"{mode}-failure.png")], check=False)
        subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ".", "getwindowname", "%@"],
                       check=False)
        raise
    finally:
        if mode in {"fresh", "existing"}:
            # The X server and profile belong solely to this test. Keep the
            # unsaved checkpoint as evidence and stop only this editor.
            try:
                editor_pid = int(command("xdotool", "getwindowpid", editor_window()))
                os.kill(editor_pid, signal.SIGTERM)
            except (LookupError, OSError, subprocess.CalledProcessError):
                pass
