#!/usr/bin/env python3
"""Quarantine one verified MarkWriter macOS bundle; never remove user data."""
import argparse
import contextlib
import ctypes
import fcntl
import grp
import hashlib
import json
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
    if args[:2] == (PLUGIN, '-r'):
        subprocess.run(args, check=True, text=True, capture_output=True)
    else:
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

def record_path(app, version):
    key = unicodedata.normalize('NFD', app.name).casefold() + '\0' + version
    return app.parent / QUARANTINE / ('.transaction-' + hashlib.sha256(key.encode('utf-8')).hexdigest() + '.json')

def sync_directory(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def read_record(app, version, backup):
    path = record_path(app, version)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise Refusal(f'Cannot safely open transaction record: {exc}') from exc
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1 or
                info.st_mode & 0o077 or info.st_size < 1 or info.st_size > 8192):
            raise Refusal('Unsafe transaction record ownership, permissions, or size')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read(8193)
        after = os.fstat(fd)
        if (len(raw) > 8192 or len(raw) != info.st_size or
                (after.st_size, after.st_mtime_ns, after.st_ctime_ns) !=
                (info.st_size, info.st_mtime_ns, info.st_ctime_ns)):
            raise Refusal('Transaction record changed while reading')
        def unique_object(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError('Duplicate transaction field')
                result[key] = value
            return result
        try:
            data = json.loads(raw, object_pairs_hook=unique_object)
        except (ValueError, UnicodeError, RecursionError) as exc:
            raise Refusal('Malformed transaction record') from exc
        keys = {'schema', 'app', 'backup', 'version', 'device', 'inode', 'digest'}
        if (not isinstance(data, dict) or set(data) != keys or type(data['schema']) is not int or data['schema'] != 1 or
                data['app'] != str(app) or data['backup'] != str(backup) or data['version'] != version or
                type(data['device']) is not int or data['device'] < 0 or
                type(data['inode']) is not int or data['inode'] < 1 or
                not isinstance(data['digest'], str) or not re.fullmatch('[0-9a-f]{64}', data['digest'])):
            raise Refusal('Transaction record does not match the selected path and version')
        return ((data['device'], data['inode'], bytes.fromhex(data['digest'])), (info.st_dev, info.st_ino))
    finally:
        os.close(fd)

def create_record(app, version, backup, proof):
    path = record_path(app, version)
    data = {'schema': 1, 'app': str(app), 'backup': str(backup), 'version': version,
            'device': proof[0], 'inode': proof[1], 'digest': proof[2].hex()}
    payload = json.dumps(data, ensure_ascii=True, separators=(',', ':')).encode('ascii')
    if len(payload) > 8192:
        raise Refusal('Transaction record would be too large')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(payload)
            stream.flush()
        os.fsync(fd)
    finally:
        os.close(fd)
    sync_directory(path.parent)
    record = read_record(app, version, backup)
    if record is None or record[0] != proof:
        raise Refusal('Cannot establish transaction record')
    return record

def clear_record(app, version, record):
    path = record_path(app, version)
    backup = path.parent / (app.name + '.' + version + '.quarantined')
    if read_record(app, version, backup) != record or entry_identity(path) != record[1]:
        raise Refusal('Transaction record changed; refusing cleanup')
    path.unlink()
    sync_directory(path.parent)

def verify_proof(path, version, proof):
    if entry_identity(path) != proof[:2]:
        raise Refusal('Bundle does not match the recorded transaction identity')
    verify(path, version)
    if identity(path) != proof:
        raise Refusal('Bundle contents do not match the recorded transaction identity')

def read_component(app, relative, digest=None, limit=None):
    # Hold each directory open without following symlinks, then inspect the
    # opened file itself. A FIFO substituted after an earlier lstat must not
    # block a recovery path or be interpreted as bundle metadata.
    opened = []
    try:
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
        root = os.open(app, flags)
        opened.append(root)
        root_info = os.fstat(root)
        if not stat.S_ISDIR(root_info.st_mode) or root_info.st_uid not in (0, os.geteuid()) or root_info.st_mode & 0o022:
            raise Refusal('Unsafe bundle directory during read')
        chain = []
        current = root
        parts = Path(relative).parts
        for part in parts[:-1]:
            fd = os.open(part, flags, dir_fd=current)
            opened.append(fd)
            info = os.fstat(fd)
            if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
                raise Refusal('Unsafe bundle directory during read')
            chain.append((current, part, info.st_dev, info.st_ino))
            current = fd
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=current)
        opened.append(fd)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
            raise Refusal('Required bundle component is not a safe regular file')
        if limit is not None and info.st_size > limit:
            raise Refusal('Bundle metadata exceeds the size limit')
        result = bytearray() if digest is None else None
        count = 0
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if limit is not None and count > limit:
                raise Refusal('Bundle metadata exceeds the size limit')
            if digest is None:
                result.extend(chunk)
            else:
                digest.update(chunk)
        after = os.fstat(fd)
        named = os.stat(parts[-1], dir_fd=current, follow_symlinks=False)
        if (count != info.st_size or
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) !=
                (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) or
                (named.st_dev, named.st_ino) != (info.st_dev, info.st_ino)):
            raise Refusal('Bundle component changed during read')
        for parent, name, device, inode in chain:
            named_dir = os.stat(name, dir_fd=parent, follow_symlinks=False)
            if (named_dir.st_dev, named_dir.st_ino) != (device, inode):
                raise Refusal('Bundle directory changed during read')
        named_root = app.lstat()
        if (named_root.st_dev, named_root.st_ino) != (root_info.st_dev, root_info.st_ino):
            raise Refusal('Bundle changed during read')
        return bytes(result) if result is not None else None
    except OSError as exc:
        raise Refusal(f'Cannot safely read bundle component: {exc}') from exc
    finally:
        for fd in reversed(opened):
            os.close(fd)

def identity(app):
    info = app.lstat()
    digest = hashlib.sha256()
    for relative in ('Contents/Info.plist', 'Contents/MacOS/markwriter',
                     'Contents/_CodeSignature/CodeResources',
                     str(EXT / 'Contents/Info.plist'),
                     str(EXT / 'Contents/MacOS/QuickLookPrototype'),
                     str(EXT / 'Contents/_CodeSignature/CodeResources')):
        limit = 4 * 1024 * 1024 if relative.endswith('Info.plist') else (32 * 1024 * 1024 if relative.endswith('CodeResources') else None)
        read_component(app, relative, digest=digest, limit=limit)
    if entry_identity(app) != (info.st_dev, info.st_ino):
        raise Refusal('Bundle changed while computing its identity')
    return info.st_dev, info.st_ino, digest.digest()

def entry_identity(path):
    info = path.lstat()
    return info.st_dev, info.st_ino

def return_observed(source, destination, observed):
    # Move only the item actually observed after the first exclusive rename.
    if entry_identity(source) != observed:
        raise Refusal('Moved item changed; refusing automatic return')
    rename_exclusive(source, destination)
    if entry_identity(destination) != observed:
        raise Refusal('Returned item changed during recovery')

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
    directories = {0, 2, 4, 5, 6, 8, 10, 12}
    for index, path in enumerate(paths):
        info = path.lstat()
        if index in directories:
            if not stat.S_ISDIR(info.st_mode):
                raise Refusal(f'Required bundle component is not a directory: {path}')
        elif not stat.S_ISREG(info.st_mode):
            raise Refusal(f'Required bundle component is not a regular file: {path}')
        if info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022:
            raise Refusal(f'Unsafe component ownership or permissions: {path}')
    if sorted(p.name for p in (app / 'Contents/PlugIns').iterdir()) != ['MarkWriterQuickLook.appex']:
        raise Refusal('Unexpected extension layout')
    try:
        host = plistlib.loads(read_component(app, 'Contents/Info.plist', limit=4 * 1024 * 1024))
        ext = plistlib.loads(read_component(app, str(EXT / 'Contents/Info.plist'), limit=4 * 1024 * 1024))
    except Exception as exc:
        # plistlib can raise different parse/shape errors for corrupt binary
        # and XML inputs; convert them while preserving transaction recovery.
        raise Refusal('Malformed or unreadable bundle metadata') from exc
    if not isinstance(host, dict) or not isinstance(ext, dict) or not isinstance(ext.get('NSExtension'), dict):
        raise Refusal('Unexpected bundle metadata shape')
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

def assert_stopped(app, prior_path=None):
    result = subprocess.run(['/bin/ps', '-ww', '-axo', 'comm='], check=True, text=True, capture_output=True)
    # Compare directory identities rather than strings: APFS may report a
    # decomposed or differently cased spelling for the same selected bundle.
    target = os.stat(app)
    normalized_prefix = unicodedata.normalize('NFD', str(app)).casefold() + '/'
    previous_prefix = unicodedata.normalize('NFD', str(prior_path)).casefold() + '/' if prior_path else None
    for line in result.stdout.splitlines():
        executable = line.strip()
        if not executable.startswith('/'):
            continue
        if previous_prefix and unicodedata.normalize('NFD', executable).casefold().startswith(previous_prefix):
            raise Refusal('A process still refers to the original app path; quit it and retry')
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

def registration_paths():
    result = subprocess.run([PLUGIN, '-m', '-ADvv', '-i', 'com.markwriter.app.quicklook'],
                            check=True, text=True, capture_output=True)
    if result.stderr and result.stderr.strip():
        raise Refusal('PlugInKit query returned a warning')
    output = result.stdout.strip()
    if output == '(no matches)':
        return []
    paths = re.findall(r'^\s*Path = (.+)$', output, flags=re.MULTILINE)
    count = re.search(r'^\s*\(([0-9]+) plug-ins?\)\s*$', output, flags=re.MULTILINE)
    if not count or int(count.group(1)) != len(paths) or not paths or any(not p.startswith('/') for p in paths):
        raise Refusal('Cannot establish complete PlugInKit registration state')
    return paths

def confirm_unregistered(app, backup):
    def normalized(path):
        return unicodedata.normalize('NFD', os.path.normpath(str(path))).casefold()
    original = normalized(app / EXT)
    moved = normalized(backup / EXT)
    for record in registration_paths():
        if normalized(record) in (original, moved):
            raise Refusal('Selected extension is still registered')
        try:
            if os.path.samefile(record, backup / EXT):
                raise Refusal('Quarantined extension is still registered')
        except OSError as exc:
            raise Refusal(f'Cannot inspect registered extension path: {exc}')

def run_locked(app, version, apply=False, restore=False, repair=False):
    backup_dir = app.parent / QUARANTINE
    backup = backup_dir / (app.name + '.' + version + '.quarantined')
    for p in (backup_dir, backup):
        if p.is_symlink():
            raise Refusal(f'Symlink at backup path: {p}')
    if backup_dir.exists() and (not backup_dir.is_dir() or backup_dir.stat().st_uid != os.getuid() or backup_dir.stat().st_mode & 0o077):
        raise Refusal('Backup directory must be private and owned by the current user')
    record = read_record(app, version, backup)
    if repair:
        if record is None:
            raise Refusal('Missing transaction record; inspect the app and registration manually')
        if backup.exists() or backup.is_symlink():
            raise Refusal('Backup and app both present; inspect both paths')
        verify_proof(app, version, record[0])
        assert_stopped(app)
        print(f'Register verified app and extension at {app}')
        if apply:
            verify_proof(app, version, record[0])
            register(app)
            verify_proof(app, version, record[0])
            clear_record(app, version, record)
            print('Registration commands completed.')
        else:
            print('Dry run only; add --apply to make changes.')
        return
    source = backup if restore else app
    destination = app if restore else backup
    if not source.exists():
        if not restore and backup.exists():
            if record is None:
                raise Refusal('Missing transaction record for backup; inspect both paths manually')
            verify_proof(backup, version, record[0])
            before = record[0]
            assert_stopped(backup, app)
            try:
                confirm_unregistered(app, backup)
            except (Refusal, OSError, subprocess.CalledProcessError, UnicodeError) as exc:
                raise Refusal(f'Cannot verify removal; inspect and use --restore --apply to recover: {exc}') from exc
            if app.exists() or app.is_symlink() or identity(backup) != before:
                raise Refusal('App or backup changed while verifying removal')
            print(f'Already moved to {backup}; use --restore to return it')
            return
        raise Refusal(f'Source does not exist: {source}')
    if destination.exists():
        raise Refusal(f'Destination already exists: {destination}')
    if restore and record is None:
        raise Refusal('Missing transaction record for backup; inspect both paths manually')
    if record is not None:
        verify_proof(source, version, record[0])
        original = record[0]
    else:
        verify(source, version)
        original = identity(source)
    assert_stopped(source, app if restore else None)
    print(f'{"Restore" if restore else "Remove"}: {source} -> {destination}')
    print(f'Verified version: {version}; app and extension registration are path-scoped.')
    if not apply:
        print('Dry run only; add --apply to make changes.')
        return
    if restore:
        verify_proof(source, version, record[0])
        assert_stopped(source, app)
        if identity(source) != original:
            raise Refusal('Bundle changed during operation')
        observed = None
        try:
            rename_exclusive(source, destination)
            observed = entry_identity(destination)
            verify_proof(destination, version, original)
            assert_stopped(destination)
        except (OSError, subprocess.CalledProcessError, Refusal, KeyboardInterrupt, UnicodeError):
            if observed is not None:
                try:
                    if destination.is_symlink() or not destination.is_dir():
                        raise Refusal('Moved item cannot be safely inspected')
                    assert_stopped(destination)
                    return_observed(destination, source, observed)
                except (OSError, Refusal):
                    print(f'Recovery incomplete; inspect {destination} and {source}.', file=sys.stderr)
            raise
        try:
            register(destination)
            verify_proof(destination, version, record[0])
            clear_record(app, version, record)
        except (OSError, subprocess.CalledProcessError, KeyboardInterrupt):
            print(f'Registration incomplete; app remains at {destination}. Retry with --register --apply.', file=sys.stderr)
            raise
        print(f'Restored: {destination}')
        return
    if record is None:
        record = create_record(app, version, backup, original)
    verify_proof(app, version, record[0])
    moved = False
    observed = None
    try:
        try:
            command(PLUGIN, '-r', str(app / EXT))
        except subprocess.CalledProcessError as exc:
            expected_error = 'remove: no plugin at ' + str(app / EXT)
            if (exc.returncode != 1 or exc.stdout not in (None, '') or not isinstance(exc.stderr, str) or
                    unicodedata.normalize('NFD', exc.stderr.strip()).casefold() !=
                    unicodedata.normalize('NFD', expected_error).casefold()):
                raise
            # Some macOS versions reject a Unicode path despite a matching
            # record. Continue only with path-scoped LS removal, a reversible
            # move, and independent confirmation that the record is gone.
            print('PlugInKit removal failed; checking path-scoped recovery.', file=sys.stderr)
        command(LSREGISTER, '-u', str(app))
        verify(app, version)
        assert_stopped(app)
        if identity(app) != original:
            raise Refusal('Bundle changed during operation')
        rename_exclusive(app, backup)
        moved = True
        observed = entry_identity(backup)
        verify_proof(backup, version, original)
        assert_stopped(backup, app)
        if app.exists() or app.is_symlink():
            raise Refusal('Original app path reappeared after move')
        confirm_unregistered(app, backup)
    except (OSError, subprocess.CalledProcessError, Refusal, KeyboardInterrupt, UnicodeError):
        try:
            if moved:
                if observed is None:
                    raise Refusal('Moved item identity was not captured')
                if backup.is_symlink() or not backup.is_dir():
                    raise Refusal('Moved item cannot be safely inspected')
                assert_stopped(backup, app)
                return_observed(backup, app, observed)
            if app.exists():
                verify_proof(app, version, original)
                register(app)
        except (OSError, subprocess.CalledProcessError, Refusal):
            print(f'Recovery incomplete; inspect {app} and {backup} before retrying registration.', file=sys.stderr)
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
