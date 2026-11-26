#!/usr/bin/env python3
"""Capability probe on a disposable GitHub-hosted VM; not Finder acceptance."""
import json
import os
import pathlib
import subprocess
import tempfile
import time

out = pathlib.Path('probe-evidence')
out.mkdir(exist_ok=True)
checks = {}

def run(name, command, timeout=15):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        checks[name] = {'exit': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    except subprocess.TimeoutExpired:
        checks[name] = {'timeoutSeconds': timeout}
    print(name, json.dumps(checks[name]), flush=True)

run('os', ['/usr/bin/sw_vers'])
run('architecture', ['/usr/bin/uname', '-m'])
run('console_session', ['/usr/bin/stat', '-f', '%Su', '/dev/console'])
run('logged_in_users', ['/usr/bin/who'])

with tempfile.TemporaryDirectory(prefix='markwriter-hosted-finder-') as folder:
    root = pathlib.Path(folder)
    fixture = root / 'Synthetic-Finder-Probe.txt'
    fixture.write_text('SYNTHETIC FINDER CAPABILITY PROBE\n', encoding='utf-8')
    swift = root / 'capability.swift'
    swift.write_text('''import AppKit
import ApplicationServices
import CoreGraphics
print("axTrusted=\\(AXIsProcessTrusted())")
print("screenCapturePreflight=\\(CGPreflightScreenCaptureAccess())")
print("screens=\\(NSScreen.screens.count)")
print("session=\\(CGSessionCopyCurrentDictionary() as Any)")
''', encoding='utf-8')
    run('swift_capability', ['/usr/bin/xcrun', 'swift', str(swift)], timeout=45)
    run('finder_events', ['/usr/bin/osascript', '-e', 'tell application "Finder" to get name'])
    run('system_events', ['/usr/bin/osascript', '-e', 'tell application "System Events" to get UI elements enabled'])
    run('open_and_select_fixture', ['/usr/bin/osascript', '-e',
        f'tell application "Finder"\nactivate\nreveal POSIX file "{fixture}"\nend tell'])
    time.sleep(2)
    run('finder_windows', ['/usr/bin/osascript', '-e',
        'tell application "System Events" to tell process "Finder" to get name of every window'])
    run('press_space', ['/usr/bin/osascript', '-e',
        'tell application "System Events" to tell process "Finder"\nset frontmost to true\nkey code 49\nend tell'])
    time.sleep(3)
    run('visible_processes', ['/usr/bin/osascript', '-e',
        'tell application "System Events" to get name of every process whose visible is true'])
    run('finder_windows_after', ['/usr/bin/osascript', '-e',
        'tell application "System Events" to tell process "Finder" to get name of every window'])
    run('screenshot', ['/usr/sbin/screencapture', '-x', str(out.resolve() / 'desktop.png')])
    if (out / 'desktop.png').exists():
        run('screenshot_dimensions', ['/usr/bin/sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(out / 'desktop.png')])
    run('source_hash', ['/usr/bin/shasum', '-a', '256', str(fixture)])

(out / 'capabilities.json').write_text(json.dumps(checks, indent=2) + '\n', encoding='utf-8')
print('Capability observations only; no MarkWriter extension was installed or qualified.')
