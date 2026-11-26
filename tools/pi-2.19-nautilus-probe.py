import importlib.util
from pathlib import Path
import os
import shutil
import subprocess

path = Path("tools/ubuntu-association-desktop.py")
spec = importlib.util.spec_from_file_location("desktop", path)
desktop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(desktop)
fixtures = desktop.ROOT / "association-fixtures"
fixtures.mkdir()
first = fixtures / "A Grüße 文件.md"
second = fixtures / "B Ångström sample.markdown"
third = fixtures / "C café sample.md"
fourth = fixtures / "D résumé sample.mkd"
all_fixtures = [first, second, third, fourth]
for fixture in all_fixtures:
    fixture.write_text("# Synthetic Markdown\n")
window = desktop.launch_files(fixtures, "probe")
try:
    mode = os.environ["MARKWRITER_PROBE_MODE"]
    if mode == "existing":
        assert desktop.mime_state()["default"] == "incumbent.desktop"
        x, y = desktop.fixture_tile(window, first, "incumbent")
        desktop.command("xdotool", "mousemove", str(x), str(y), "click", "--repeat", "2", "--delay", "100", "1")
        incumbent = desktop.ROOT / "incumbent-argv"
        result = desktop.wait("incumbent double-click argv", lambda: incumbent.read_text().splitlines())
        assert result == [str(first)], result
        shutil.copyfile(incumbent, desktop.EVIDENCE / "incumbent-argv.txt")
    else:
        assert mode == "fresh" and desktop.mime_state()["default"] == desktop.MARKWRITER, desktop.mime_state()
    for label, expected in (("one", [first]), ("different", [second]), ("reopen", [first]),
                            ("multiple", all_fixtures)):
        desktop.choose_markwriter(window, expected[0], label, multiple=label == "multiple")
        argv = desktop.ROOT / "argv"
        result = desktop.wait("actual launch argv", lambda: argv.read_text().splitlines())
        assert sorted(result) == sorted(str(fixture) for fixture in expected), result
        shutil.copyfile(argv, desktop.EVIDENCE / f"{label}-argv.txt")
        argv.unlink()
    expected_default = "incumbent.desktop" if mode == "existing" else desktop.MARKWRITER
    assert desktop.mime_state()["default"] == expected_default
except Exception:
    subprocess.run(["scrot", str(desktop.EVIDENCE / "probe-failure.png")], check=False)
    subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ".", "getwindowname", "%@"], check=False)
    raise
