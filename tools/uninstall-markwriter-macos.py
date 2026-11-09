#!/usr/bin/env python3
"""Quarantine one verified MarkWriter macOS bundle; never remove user data."""
import argparse
import os
from pathlib import Path
import plistlib
import subprocess
import sys

LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
PLUGIN = '/usr/bin/pluginkit'
CODESIGN = '/usr/bin/codesign'
EXT = Path('Contents/PlugIns/MarkWriterQuickLook.appex')
QUARANTINE = '.markwriter-removal-backup'

class Refusal(Exception):
    pass

def command(*args):
    subprocess.run(args, check=True)

def checked_path(raw):
    p = Path(raw)
    if not p.is_absolute() or '..' in p.parts or str(p) != raw or p.name != 'MarkWriter.app' or any(ord(c) < 32 or ord(c) == 127 for c in raw):
        raise Refusal('Use a normalized absolute path ending in MarkWriter.app')
    current = Path('/')
    for part in p.parts[1:]:
        current /= part
        if current.is_symlink():
            raise Refusal(f'Symlink in path: {current}')
    return p

def verify(app, version):
    if not app.is_dir():
        raise Refusal(f'App is missing or not a directory: {app}')
    paths = [app / 'Contents', app / 'Contents/Info.plist', app / 'Contents/MacOS', app / 'Contents/MacOS/markwriter',
             app / 'Contents/PlugIns', app / EXT, app / EXT / 'Contents', app / EXT / 'Contents/Info.plist']
    if any(p.is_symlink() or not p.exists() for p in paths):
        raise Refusal('Missing or symlinked required bundle component')
    if not paths[3].is_file():
        raise Refusal('Host executable is not a file')
    if sorted(p.name for p in (app / 'Contents/PlugIns').iterdir()) != ['MarkWriterQuickLook.appex']:
        raise Refusal('Unexpected extension layout')
    with (app / 'Contents/Info.plist').open('rb') as f:
        host = plistlib.load(f)
    with (app / EXT / 'Contents/Info.plist').open('rb') as f:
        ext = plistlib.load(f)
    if host.get('CFBundleIdentifier') != 'com.markwriter.app' or ext.get('CFBundleIdentifier') != 'com.markwriter.app.quicklook':
        raise Refusal('Bundle identifiers do not match')
    if host.get('CFBundleShortVersionString') != version or ext.get('CFBundleShortVersionString') != version:
        raise Refusal('Bundle versions do not match the requested version')
    if not host.get('CFBundleVersion') or host.get('CFBundleVersion') != ext.get('CFBundleVersion'):
        raise Refusal('Bundle build numbers do not match')
    if ext.get('NSExtension', {}).get('NSExtensionPointIdentifier') != 'com.apple.quicklook.preview':
        raise Refusal('Unexpected extension point')
    command(CODESIGN, '--verify', '--strict', str(app / EXT))
    command(CODESIGN, '--verify', '--deep', '--strict', str(app))

def assert_stopped(app):
    result = subprocess.run(['/bin/ps', '-ww', '-axo', 'comm='], check=True, text=True, capture_output=True)
    prefix = str(app) + '/'
    if any(line.strip().startswith(prefix) for line in result.stdout.splitlines()):
        raise Refusal('A process from this app is running; quit MarkWriter and its extension, then retry')

def register(app):
    command(LSREGISTER, '-f', str(app))
    command(PLUGIN, '-a', str(app / EXT))

def run(app, version, apply=False, restore=False, repair=False):
    backup_dir = app.parent / QUARANTINE
    backup = backup_dir / app.name
    for p in (backup_dir, backup):
        if p.is_symlink():
            raise Refusal(f'Symlink at backup path: {p}')
    if backup_dir.exists() and (not backup_dir.is_dir() or backup_dir.stat().st_uid != os.getuid() or backup_dir.stat().st_mode & 0o077):
        raise Refusal('Backup directory must be private and owned by the current user')
    if repair:
        verify(app, version)
        assert_stopped(app)
        print(f'Register verified app and extension at {app}')
        if apply:
            register(app)
            print('Registration commands completed.')
        else:
            print('Dry run only; add --apply to make changes.')
        return
    source = backup if restore else app
    destination = app if restore else backup
    if not source.exists():
        if not restore and backup.exists():
            verify(backup, version)
            print(f'Already moved to {backup}; use --restore to return it')
            return
        raise Refusal(f'Source does not exist: {source}')
    if destination.exists():
        raise Refusal(f'Destination already exists: {destination}')
    verify(source, version)
    assert_stopped(source)
    print(f'{"Restore" if restore else "Remove"}: {source} -> {destination}')
    print(f'Verified version: {version}; app and extension registration are path-scoped.')
    if not apply:
        print('Dry run only; add --apply to make changes.')
        return
    if restore:
        os.rename(source, destination)
        try:
            register(destination)
        except (OSError, subprocess.CalledProcessError):
            print(f'Registration incomplete; app remains at {destination}. Retry with --register --apply.', file=sys.stderr)
            raise
        print(f'Restored: {destination}')
        return
    if not backup_dir.exists():
        backup_dir.mkdir(mode=0o700)
    try:
        command(PLUGIN, '-r', str(app / EXT))
        command(LSREGISTER, '-u', str(app))
        os.rename(app, backup)
    except (OSError, subprocess.CalledProcessError):
        if app.exists():
            try:
                register(app)
            except (OSError, subprocess.CalledProcessError):
                print(f'Re-registration failed; manually register {app} and {app / EXT}.', file=sys.stderr)
        raise
    print(f'Moved to {backup}. Restore with the same command plus --restore --apply.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', required=True, help='absolute selected MarkWriter.app path')
    parser.add_argument('--version', required=True, help='exact installed bundle version, e.g. 2.7.3')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--restore', action='store_true', help='restore the quarantined copy')
    modes.add_argument('--register', action='store_true', help='repair registration of the selected existing app')
    parser.add_argument('--apply', action='store_true', help='perform changes; default is dry run')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('macOS only')
    try:
        run(checked_path(args.app), args.version, args.apply, args.restore, args.register)
    except (Refusal, OSError, ValueError, plistlib.InvalidFileException, subprocess.CalledProcessError) as exc:
        print(f'Refused or failed: {exc}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
