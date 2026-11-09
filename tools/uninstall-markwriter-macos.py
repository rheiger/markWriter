#!/usr/bin/env python3
"""Quarantine one verified MarkWriter macOS bundle; never remove user data."""
import argparse
import contextlib
import ctypes
import fcntl
import grp
import hashlib
import os
from pathlib import Path
import plistlib
import re
import signal
import stat
import subprocess
import sys
import unicodedata

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
    if not p.is_absolute() or '..' in p.parts or str(p) != raw or not p.name.endswith('.app') or p.name == '.app' or p.parent == Path('/') or any(ord(c) < 32 or ord(c) == 127 for c in raw):
        raise Refusal('Use a normalized absolute path to an app outside the filesystem root')
    current = Path('/')
    for part in p.parts[1:]:
        current /= part
        if current.is_symlink():
            raise Refusal(f'Symlink in path: {current}')
    safe_parents(p.parent)
    return p

def safe_parents(parent):
    if os.geteuid() == 0:
        raise Refusal('Do not run as root or with sudo')
    try:
        admin_gid = grp.getgrnam('admin').gr_gid
    except KeyError:
        admin_gid = -1
    current = Path('/')
    for part in parent.parts[1:]:
        current /= part
        info = current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.geteuid()):
            raise Refusal(f'Unsafe directory owner or type: {current}')
        writable = info.st_mode & 0o022
        allowed_applications = current == Path('/Applications') and info.st_uid == 0 and info.st_gid == admin_gid and not (info.st_mode & 0o002)
        allowed_sticky = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX) and current != parent
        if writable and not (allowed_applications or allowed_sticky):
            raise Refusal(f'Unsafe writable directory: {current}')

def rename_exclusive(source, destination):
    libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    rename = libc.renamex_np
    rename.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(os.fsencode(source), os.fsencode(destination), 0x00000004) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number), str(destination))

@contextlib.contextmanager
def transaction_lock(directory, app):
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        pass
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise Refusal('Backup directory must be private and owned by the current user')
    lock = directory / ('.lock-' + hashlib.sha256(unicodedata.normalize('NFD', app.name).casefold().encode('utf-8')).hexdigest())
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1 or info.st_mode & 0o077:
            raise Refusal('Unsafe lock file')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refusal('Another operation is in progress for this app')
        yield
    finally:
        os.close(fd)

def identity(app):
    info = app.lstat()
    digest = hashlib.sha256()
    for relative in ('Contents/Info.plist', 'Contents/MacOS/markwriter',
                     'Contents/_CodeSignature/CodeResources',
                     str(EXT / 'Contents/Info.plist'),
                     str(EXT / 'Contents/MacOS/QuickLookPrototype'),
                     str(EXT / 'Contents/_CodeSignature/CodeResources')):
        with (app / relative).open('rb') as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
    return info.st_dev, info.st_ino, digest.digest()

def verify(app, version):
    if app.is_symlink() or not app.is_dir():
        raise Refusal(f'App is missing or not a directory: {app}')
    info = app.lstat()
    if info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
        raise Refusal('App directory has unsafe ownership or write permissions')
    paths = [app / 'Contents', app / 'Contents/Info.plist', app / 'Contents/MacOS', app / 'Contents/MacOS/markwriter',
             app / 'Contents/PlugIns', app / EXT, app / EXT / 'Contents', app / EXT / 'Contents/Info.plist', app / EXT / 'Contents/MacOS', app / EXT / 'Contents/MacOS/QuickLookPrototype',
             app / 'Contents/_CodeSignature', app / 'Contents/_CodeSignature/CodeResources',
             app / EXT / 'Contents/_CodeSignature', app / EXT / 'Contents/_CodeSignature/CodeResources']
    if any(p.is_symlink() or not p.exists() for p in paths):
        raise Refusal('Missing or symlinked required bundle component')
    if not paths[3].is_file() or not paths[9].is_file():
        raise Refusal('Host executable is not a file')
    for path in paths:
        info = path.lstat()
        if info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
            raise Refusal(f'Unsafe component ownership or permissions: {path}')
    if sorted(p.name for p in (app / 'Contents/PlugIns').iterdir()) != ['MarkWriterQuickLook.appex']:
        raise Refusal('Unexpected extension layout')
    with (app / 'Contents/Info.plist').open('rb') as f:
        host = plistlib.load(f)
    with (app / EXT / 'Contents/Info.plist').open('rb') as f:
        ext = plistlib.load(f)
    if host.get('CFBundlePackageType') != 'APPL' or host.get('CFBundleExecutable') != 'markwriter' or ext.get('CFBundleExecutable') != 'QuickLookPrototype' or ext.get('CFBundlePackageType') != 'XPC!':
        raise Refusal('Unexpected executable or extension package type')
    if host.get('CFBundleIdentifier') != 'com.markwriter.app' or ext.get('CFBundleIdentifier') != 'com.markwriter.app.quicklook':
        raise Refusal('Bundle identifiers do not match')
    if host.get('CFBundleShortVersionString') != version or ext.get('CFBundleShortVersionString') != version:
        raise Refusal('Bundle versions do not match the requested version')
    if not host.get('CFBundleVersion') or host.get('CFBundleVersion') != ext.get('CFBundleVersion'):
        raise Refusal('Bundle build numbers do not match')
    if ext.get('NSExtension', {}).get('NSExtensionPointIdentifier') != 'com.apple.quicklook.preview':
        raise Refusal('Unexpected extension point')
    command(CODESIGN, '--verify', '--strict', '-R=identifier \"com.markwriter.app.quicklook\"', str(app / EXT))
    command(CODESIGN, '--verify', '--deep', '--strict', str(app))
    command(CODESIGN, '--verify', '--strict', '-R=identifier \"com.markwriter.app\"', str(app))

def assert_stopped(app):
    result = subprocess.run(['/bin/ps', '-ww', '-axo', 'comm='], check=True, text=True, capture_output=True)
    # Compare directory identities rather than strings: APFS may report a
    # decomposed or differently cased spelling for the same selected bundle.
    target = os.stat(app)
    normalized_prefix = unicodedata.normalize('NFD', str(app)).casefold() + '/'
    for line in result.stdout.splitlines():
        executable = line.strip()
        if not executable.startswith('/'):
            continue
        for parent in Path(executable).parents:
            try:
                info = os.stat(parent)
            except OSError:
                # If a matching path cannot be inspected, fail closed instead
                # of declaring the app stopped on incomplete evidence.
                if unicodedata.normalize('NFD', executable).casefold().startswith(normalized_prefix):
                    raise Refusal('Cannot inspect a process from this app; quit it and retry')
                continue
            if (info.st_dev, info.st_ino) == (target.st_dev, target.st_ino):
                raise Refusal('A process from this app is running; quit MarkWriter and its extension, then retry')

def register(app):
    command(LSREGISTER, '-f', str(app))
    command(PLUGIN, '-a', str(app / EXT))

def run_locked(app, version, apply=False, restore=False, repair=False):
    backup_dir = app.parent / QUARANTINE
    backup = backup_dir / (app.name + '.' + version + '.quarantined')
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
    original = identity(source)
    assert_stopped(source)
    print(f'{"Restore" if restore else "Remove"}: {source} -> {destination}')
    print(f'Verified version: {version}; app and extension registration are path-scoped.')
    if not apply:
        print('Dry run only; add --apply to make changes.')
        return
    if restore:
        verify(source, version)
        assert_stopped(source)
        if identity(source) != original:
            raise Refusal('Bundle changed during operation')
        rename_exclusive(source, destination)
        try:
            register(destination)
        except (OSError, subprocess.CalledProcessError, KeyboardInterrupt):
            print(f'Registration incomplete; app remains at {destination}. Retry with --register --apply.', file=sys.stderr)
            raise
        print(f'Restored: {destination}')
        return
    try:
        command(PLUGIN, '-r', str(app / EXT))
        command(LSREGISTER, '-u', str(app))
        verify(app, version)
        assert_stopped(app)
        if identity(app) != original:
            raise Refusal('Bundle changed during operation')
        rename_exclusive(app, backup)
    except (OSError, subprocess.CalledProcessError, Refusal, KeyboardInterrupt):
        if app.exists():
            try:
                if identity(app) != original:
                    raise Refusal('Bundle changed; refusing automatic registration')
                verify(app, version)
                register(app)
            except (OSError, subprocess.CalledProcessError, Refusal):
                print(f'Re-registration failed; manually register {app} and {app / EXT}.', file=sys.stderr)
        raise
    print(f'Moved to {backup}. Restore with the same command plus --restore --apply.')

def run(app, version, apply=False, restore=False, repair=False):
    if len(version) > 100 or not re.fullmatch(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?', version, flags=re.ASCII):
        raise Refusal('Version must be a safe semantic version such as 2.7.3')
    safe_parents(app.parent)
    if apply:
        with transaction_lock(app.parent / QUARANTINE, app):
            safe_parents(app.parent)
            return run_locked(app, version, apply, restore, repair)
    return run_locked(app, version, apply, restore, repair)

def interrupted(signum, frame):
    raise KeyboardInterrupt(f'Interrupted by signal {signum}')

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
    signal.signal(signal.SIGTERM, interrupted)
    try:
        run(checked_path(args.app), args.version, args.apply, args.restore, args.register)
    except (Refusal, OSError, ValueError, plistlib.InvalidFileException, subprocess.CalledProcessError, KeyboardInterrupt) as exc:
        print(f'Refused or failed: {exc}', file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
