#!/usr/bin/env python3
"""Qualify same-path MarkWriter replacement with an already authenticated staging bundle."""
import argparse
import contextlib
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile


# The removal tool ships as a standalone script. Use its guards without
# changing that distribution contract.
_removal_spec = importlib.util.spec_from_file_location(
    'markwriter_macos_removal', Path(__file__).with_name('uninstall-markwriter-macos.py')
)
removal = importlib.util.module_from_spec(_removal_spec)
_removal_spec.loader.exec_module(removal)

JOURNAL = 'transaction.json'
STAGED_BUNDLE = 'staged.app'
MAX_JOURNAL_BYTES = 8192
STABLE_VERSION = re.compile(r'(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){2}')


def staging_dir(app):
    return app.parent / f'.{app.name}.update'


def validate_versions(old, new):
    def parts(version):
        if len(version) > 60 or not STABLE_VERSION.fullmatch(version):
            raise removal.Refusal('Use exact stable versions such as 2.14.3')
        return tuple(map(int, version.split('.')))
    if parts(new) <= parts(old):
        raise removal.Refusal('Candidate version must be newer than the installed version')


def validate_layout(app, slot, old, new):
    removal.checked_path(str(app))
    removal.checked_path(str(slot))
    parent = app.parent.lstat()
    stage = slot.parent.lstat()
    if parent.st_uid != os.geteuid():
        raise removal.Refusal('Use an installation in a directory owned by the current user')
    if not stat.S_ISDIR(stage.st_mode) or stage.st_uid != os.geteuid() or stage.st_mode & 0o077:
        raise removal.Refusal('Staging directory must be private and owned by the current user')
    for bundle in (app, slot):
        info = bundle.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_dev != parent.st_dev:
            raise removal.Refusal('Both bundles must be user-owned directories on the install volume')
    if stage.st_dev != parent.st_dev:
        raise removal.Refusal('Staging must be on the install volume')

    quarantine = app.parent / removal.QUARANTINE
    for version in (old, new):
        backup = quarantine / f'{app.name}.{version}.quarantined'
        record = removal.record_path(app, version)
        if os.path.lexists(backup) or os.path.lexists(record):
            raise removal.Refusal('Resolve the existing removal transaction before replacement')


def write_journal(app, slot, old, old_proof, new, new_proof):
    path = slot.parent / JOURNAL
    data = [1, str(app), [old, *old_proof[:2], old_proof[2].hex()],
            [new, *new_proof[:2], new_proof[2].hex()]]
    payload = json.dumps(data, separators=(',', ':')).encode('ascii')
    if len(payload) > MAX_JOURNAL_BYTES:
        raise removal.Refusal('Transaction journal would exceed its size limit')
    with tempfile.NamedTemporaryFile(dir=slot.parent, prefix='.journal-', delete=False) as stream:
        temp_path = Path(stream.name)
        try:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
            removal.rename_exclusive(temp_path, path)
            removal.sync_directory(path.parent)
        finally:
            temp_path.unlink(missing_ok=True)


def read_journal(app, slot, old, new):
    path = slot.parent / JOURNAL
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or
            info.st_nlink != 1 or info.st_mode & 0o077):
        raise removal.Refusal('Unsafe transaction journal')
    raw = removal.read_component(slot.parent, JOURNAL, limit=MAX_JOURNAL_BYTES)
    if removal.entry_identity(path) != (info.st_dev, info.st_ino):
        raise removal.Refusal('Transaction journal changed during read')
    try:
        schema, installed, prior, candidate = json.loads(raw)
        if type(schema) is not int or schema != 1 or installed != str(app):
            raise ValueError('unexpected journal identity')

        def parse(proof, version):
            selected, device, inode, digest = proof
            if (selected != version or type(device) is not int or device < 0 or
                    type(inode) is not int or inode < 1 or
                    not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest)):
                raise ValueError('unexpected bundle proof')
            return device, inode, bytes.fromhex(digest)

        if not all(isinstance(proof, list) for proof in (prior, candidate)):
            raise ValueError('unexpected proof type')
        old_proof, new_proof = parse(prior, old), parse(candidate, new)
        if old_proof[:2] == new_proof[:2]:
            raise ValueError('duplicate bundle identity')
        return old_proof, new_proof
    except (TypeError, ValueError, RecursionError) as exc:
        raise removal.Refusal('Journal does not match the requested transaction') from exc


@contextlib.contextmanager
def open_directory(path, *, dir_fd=None):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=dir_fd)
    try:
        yield fd
    finally:
        os.close(fd)


def exchange_paths(app, slot, app_proof, slot_proof):
    """Exchange the two exact directory entries in a single Darwin operation."""
    libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    rename = libc.renameatx_np
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    with open_directory(app.parent) as app_fd, open_directory(slot.parent.name, dir_fd=app_fd) as slot_fd:
        for path, fd, proof in ((app, app_fd, app_proof), (slot, slot_fd, slot_proof)):
            parent = os.fstat(fd)
            entry = os.stat(path.name, dir_fd=fd, follow_symlinks=False)
            if ((parent.st_dev, parent.st_ino) != removal.entry_identity(path.parent) or
                    (entry.st_dev, entry.st_ino) != proof[:2]):
                raise removal.Refusal('A bundle or its parent changed before exchange')
        # RENAME_SWAP. There is no multi-rename fallback on unsupported volumes.
        if rename(app_fd, os.fsencode(app.name), slot_fd, os.fsencode(slot.name), 0x00000002) != 0:
            number = ctypes.get_errno()
            raise OSError(number, os.strerror(number), str(app))
        os.fsync(app_fd)
        os.fsync(slot_fd)


def registration_status(app, slot):
    """Inspect only MarkWriter registrations, rejecting a registered staging slot."""
    selected = []
    others = set()
    for name in removal.registration_paths():
        record = Path(name)
        if record == slot / removal.EXT:
            raise removal.Refusal('The staging bundle must stay unregistered')
        try:
            if record.samefile(slot / removal.EXT):
                raise removal.Refusal('The staging bundle must stay unregistered')
            if record.samefile(app / removal.EXT):
                selected.append(record)
                continue
        except FileNotFoundError:
            # Leave stale, unrelated records alone.
            pass
        others.add(record)
    return selected, others


def verify_pair(app, slot, old, new, proofs):
    old_proof, new_proof = proofs
    if removal.entry_identity(app) == old_proof[:2]:
        installed, parked = (old, old_proof), (new, new_proof)
    else:
        installed, parked = (new, new_proof), (old, old_proof)
    removal.verify_proof(app, *installed)
    removal.verify_proof(slot, *parked)
    return installed, parked


def run_locked(app, slot, old, new, *, apply, rollback):
    validate_layout(app, slot, old, new)
    proofs = read_journal(app, slot, old, new)
    if proofs is None:
        if rollback:
            raise removal.Refusal('There is no recorded replacement to roll back')
        removal.verify(app, old)
        removal.verify(slot, new)
        proofs = removal.identity(app), removal.identity(slot)
        new_journal = True
    else:
        new_journal = False
    installed, parked = verify_pair(app, slot, old, new, proofs)
    removal.assert_stopped(app)
    removal.assert_stopped(slot)
    selected, others = registration_status(app, slot)
    desired = old if rollback else new
    print(f'Selected path {app} has version {installed[0]}; requested version {desired}.')
    print(f'Retain the other bundle at {slot}.')
    if not apply:
        print('Dry run only. Pass --apply to change the selected installation.')
        return

    if new_journal:
        write_journal(app, slot, old, proofs[0], new, proofs[1])
    if read_journal(app, slot, old, new) != proofs:
        raise removal.Refusal('Cannot establish transaction journal')
    if installed[0] != desired:
        removal.sync_directory(slot.parent)
        if selected:
            removal.remove_quicklook_registration(app)
        removal.command(removal.LSREGISTER, '-u', str(app))
        validate_layout(app, slot, old, new)
        removal.verify_proof(app, *installed)
        removal.verify_proof(slot, *parked)
        removal.assert_stopped(app)
        removal.assert_stopped(slot)
        selected, remaining = registration_status(app, slot)
        if selected or not others.issubset(remaining):
            raise removal.Refusal('Could not confirm outgoing registration removal and competing paths')
        exchange_paths(app, slot, installed[1], parked[1])
    else:
        # A prior swap may have succeeded before either directory was synced.
        removal.sync_directory(app.parent)
        removal.sync_directory(slot.parent)

    installed, _ = verify_pair(app, slot, old, new, proofs)
    if installed[0] != desired:
        raise removal.Refusal('The exact requested version is not at the selected path')
    removal.assert_stopped(app)
    removal.register(app, *installed)
    verify_pair(app, slot, old, new, proofs)
    selected, remaining = registration_status(app, slot)
    if not selected or not others.issubset(remaining):
        raise removal.Refusal('Could not confirm selected and competing extension registrations')
    print(f'Verified version {desired} at {app}. Transaction journal and both bundles retained.')
    print('PlugInKit reports the selected path. Verify the active provider and version in Finder.')


def run(app, old, new, *, apply=False, rollback=False):
    validate_versions(old, new)
    slot = staging_dir(app) / STAGED_BUNDLE
    validate_layout(app, slot, old, new)
    lock = (removal.transaction_lock(app.parent / removal.QUARANTINE, app)
            if apply else contextlib.nullcontext())
    with lock:
        run_locked(app, slot, old, new, apply=apply, rollback=rollback)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', required=True, help='exact absolute path to the selected installed app')
    parser.add_argument('--installed-version', required=True, help='prior version in the A/B pair')
    parser.add_argument('--candidate-version', required=True, help='newer version in the A/B pair')
    parser.add_argument('--apply', action='store_true', help='perform changes (default: dry run)')
    parser.add_argument('--rollback', action='store_true', help='restore the recorded prior version')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('macOS only')
    signal.signal(signal.SIGTERM, removal.interrupted)
    try:
        run(removal.checked_path(args.app), args.installed_version, args.candidate_version,
            apply=args.apply, rollback=args.rollback)
    except (removal.Refusal, OSError, ValueError, subprocess.CalledProcessError, KeyboardInterrupt) as exc:
        print(f'Replacement refused or incomplete: {exc}', file=sys.stderr)
        print('Inspect both paths with a dry run before retrying or choosing rollback.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
