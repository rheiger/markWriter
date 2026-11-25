import importlib.util
from pathlib import Path
import shutil
import subprocess

path = Path("tools/ubuntu-association-desktop.py")
spec = importlib.util.spec_from_file_location("desktop", path)
desktop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(desktop)
fixtures = desktop.ROOT / "association-fixtures"
fixtures.mkdir()
first = fixtures / "A Grüße 文件.md"
second = fixtures / "B café.md"
for fixture in (first, second):
    fixture.write_text("# Synthetic Markdown\n")
with (desktop.EVIDENCE / "nautilus.log").open("w") as log:
    subprocess.Popen(["nautilus", "--new-window", str(fixtures)], stdout=log, stderr=log)
window = desktop.wait("Nautilus fixture window", lambda: desktop.window_id(r"^association-fixtures$"))
try:
    for label, expected in (("one", [first]), ("multiple", [first, second])):
        desktop.choose_markwriter(window, first, label, multiple=label == "multiple")
        argv = desktop.ROOT / "argv"
        result = desktop.wait("actual launch argv", lambda: argv.read_text().splitlines())
        assert sorted(result) == sorted(str(fixture) for fixture in expected), result
        shutil.copyfile(argv, desktop.EVIDENCE / f"{label}-argv.txt")
        argv.unlink()
except Exception:
    subprocess.run(["scrot", str(desktop.EVIDENCE / "probe-failure.png")], check=False)
    subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ".", "getwindowname", "%@"], check=False)
    raise
