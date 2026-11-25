#!/usr/bin/env python3
"""Exercise two authenticated, sealed MarkWriter builds on a disposable Mac desktop."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import tempfile
from unittest.mock import patch


_spec = importlib.util.spec_from_file_location(
    'markwriter_macos_update', Path(__file__).with_name('update-markwriter-macos.py')
)
update = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(update)
removal = update.removal
EDITOR = Path('Contents/MacOS/markwriter')
PREVIEW = removal.EXT / 'Contents/MacOS/QuickLookPrototype'
SAVED_TEXT = '# Saved MarkWriter update fixture\n'
DRAFT = 'MarkWriter macOS update recovery fixture'
OFFLINE = '(version 1)(allow default)(deny network-outbound (remote ip))'


class SimulatedInterruption(Exception):
    pass


def bundle_proof(app, version):
    removal.verify(app, version)
    for binary in (app / EDITOR, app / PREVIEW):
        arch = subprocess.check_output(['/usr/bin/lipo', '-archs', str(binary)],
                                       text=True, timeout=20).strip()
        if arch != 'arm64':
            raise removal.Refusal(f'Expected an arm64-only executable: {binary}')
    return removal.identity(app)


def copy_bundle(source, destination, version, source_proof):
    subprocess.run(['/usr/bin/ditto', str(source), str(destination)],
                   check=True, timeout=120)
    proof = bundle_proof(destination, version)
    if proof[2] != source_proof[2]:
        raise removal.Refusal('Copied bundle differs from the verified source')
    return proof


def fixture_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_workspace(workspace, saved):
    snapshot = json.loads(workspace.read_bytes())
    documents = snapshot['documents']
    named = [doc for doc in documents if doc.get('path') == str(saved)]
    drafts = [doc for doc in documents if doc.get('id') == snapshot['activeId']]
    if not (len(named) == 1 and named[0].get('isDirty') is False
            and named[0].get('content') == SAVED_TEXT):
        raise removal.Refusal('The isolated workspace lacks the expected saved fixture')
    if not (len(drafts) == 1 and drafts[0].get('isDirty') is True and not drafts[0].get('path')
            and drafts[0].get('content') in (DRAFT, DRAFT + '\n')):
        raise removal.Refusal('The isolated workspace lacks the active untitled dirty draft')


def check_provider(observed, expected):
    observed = Path(observed)
    if (not observed.is_absolute() or observed.name != expected.name or
            not observed.parent.exists() or not observed.parent.samefile(expected.parent)):
        raise removal.Refusal(f'Finder provider differed from {expected}: {observed}')


class Trial:
    def __init__(self, root, old, new):
        self.root = root
        self.old = old
        self.new = new
        self.app = root / 'MarkWriter.app'
        self.slot = update.staging_dir(self.app) / update.STAGED_BUNDLE
        self.competitor = root / 'Competing.app'
        self.profile = root / 'profile'
        self.saved = root / 'Saved.md'
        self.workspace = self.profile / 'workspace.json'
        self.preferences = self.profile / 'preferences.json'

    def record(self, kind, **fields):
        with (self.root / 'receipt.jsonl').open('a', encoding='utf-8') as receipt:
            receipt.write(json.dumps({
                'utc': datetime.now(timezone.utc).isoformat(), 'kind': kind, **fields
            }) + '\n')

    def prepare(self, prior, candidate):
        prior_proof = bundle_proof(prior, self.old)
        candidate_proof = bundle_proof(candidate, self.new)
        self.slot.parent.mkdir(mode=0o700)
        self.profile.mkdir(mode=0o700)
        self.saved.write_text(SAVED_TEXT, encoding='utf-8')
        self.preferences.write_text(json.dumps({
            'version': 1, 'config': {'restoreSession': True, 'automaticUpdateChecks': False},
        }), encoding='utf-8')
        self.old_proof = copy_bundle(prior, self.app, self.old, prior_proof)
        self.new_proof = copy_bundle(candidate, self.slot, self.new, candidate_proof)
        self.competitor_proof = copy_bundle(prior, self.competitor, self.old, prior_proof)
        self.record('prepared', baseline=self.old, candidate=self.new, platform=platform.platform(),
                    baselineBundleProof=self.old_proof[2].hex(),
                    candidateBundleProof=self.new_proof[2].hex(), profile=str(self.profile))
        self.require_registrations(selected=False)
        removal.register(self.app, self.old, self.old_proof)
        self.require_registrations()

    def require_registrations(self, *, selected=True, competing=False):
        selected_paths, others = update.registration_status(self.app, self.slot)
        if selected and not selected_paths:
            raise removal.Refusal('PlugInKit did not report the selected extension')
        if competing:
            removal.verify_proof(self.competitor, self.old, self.competitor_proof)
            if not any(path.exists() and path.samefile(self.competitor / removal.EXT)
                       for path in others):
                raise removal.Refusal('PlugInKit did not retain the competing extension')
        return len(others)

    def exercise_editor(self, phase, version, *, seed=False):
        binary = self.app / EDITOR
        removal.assert_stopped(self.app)
        log = self.root / f'{phase}-editor.log'
        with log.open('x', encoding='utf-8') as output:
            process = subprocess.Popen(
                ['/usr/bin/sandbox-exec', '-p', OFFLINE, str(binary)],
                env={**os.environ, 'MARKWRITER_PROFILE_DIR': str(self.profile)},
                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
            )
            try:
                print(f'In the isolated editor, open About and check version {version}.')
                if seed:
                    print(f'Open {self.saved} with File → Open. Create a new tab, switch to Code,\n'
                          f'type the line below exactly, and leave the draft active and unsaved.\n{DRAFT}')
                else:
                    print(f'Check that Saved.md and the active unsaved draft were restored.\n{DRAFT}')
                print('Keep the editor running. Allow its recovery write to finish before confirming.')
                displayed_version = input('After checking the editor, enter the version shown in About: ').strip()
                if displayed_version != version:
                    raise removal.Refusal('The operator did not confirm the expected editor version')
                check_workspace(self.workspace, self.saved)
                if process.poll() is not None:
                    raise removal.Refusal(f'The editor exited before confirmation. Inspect {log}')
                self.record('editor', phase=phase, operatorVersion=version, operatorRecoveryConfirmed=not seed,
                            workspaceFixtureVerified=True, process=process.pid, log=str(log))
            finally:
                if process.poll() is None:
                    # An ordinary quit prompts to save or discard the dirty fixture.
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
        check_workspace(self.workspace, self.saved)

    def exercise_finder(self, phase, version, *, competing=False):
        preview = self.root / f'{phase}-preview.md'
        marker = f'MarkWriter update trial {phase} {self.root.name}'
        preview.write_text(f'# {marker}\n', encoding='utf-8')
        print(f'In Finder, open a Space preview for {preview}.')
        print('Capture the renderer event for this preview using the log stream command in the trial guide.')
        if input('Type the full heading displayed in the Finder preview: ').strip() != marker:
            raise removal.Refusal('The operator did not confirm the expected Finder fixture')
        observed = input('While the fresh preview is visible, enter the renderer processImagePath: ').strip()
        check_provider(observed, self.app / PREVIEW)
        proof = self.new_proof if version == self.new else self.old_proof
        removal.verify_proof(self.app, version, proof)
        other_count = self.require_registrations(competing=competing)
        self.record('finder', phase=phase, operatorPreviewMarker=marker,
                    operatorRendererPath=observed, verifiedBundleVersion=version,
                    selectedRegistrationPresent=True, competingFixturePresent=competing,
                    otherRegistrationCount=other_count)
        if input('Close the Finder preview and return Finder to a different folder, then press Return: '):
            raise removal.Refusal('Finder preview closure was not confirmed')

    def exercise_transaction(self, phase, *, rollback=False):
        version, parked = (self.old, self.new) if rollback else (self.new, self.old)
        proof, parked_proof = ((self.old_proof, self.new_proof) if rollback
                               else (self.new_proof, self.old_proof))
        paths = (self.saved, self.workspace, self.preferences)
        before = {path.name: fixture_hash(path) for path in paths}
        exchange = update.exchange_paths

        def exchange_then_interrupt(*args):
            exchange(*args)
            raise SimulatedInterruption()

        update.run(self.app, self.old, self.new, rollback=rollback)
        try:
            # Interrupt immediately after the real atomic exchange, before re-registration.
            with patch.object(update, 'exchange_paths', new=exchange_then_interrupt):
                update.run(self.app, self.old, self.new, apply=True, rollback=rollback)
        except SimulatedInterruption:
            removal.verify_proof(self.app, version, proof)
            removal.verify_proof(self.slot, parked, parked_proof)
            selected, _ = update.registration_status(self.app, self.slot)
            if selected:
                raise removal.Refusal('The simulated interruption did not precede re-registration')
            self.record('interrupted-after-swap', phase=phase, installed=version, parked=parked)
        else:
            raise removal.Refusal('The first transaction did not perform the expected atomic swap')

        update.run(self.app, self.old, self.new, rollback=rollback)
        update.run(self.app, self.old, self.new, apply=True, rollback=rollback)
        update.run(self.app, self.old, self.new, apply=True, rollback=rollback)
        removal.verify_proof(self.app, version, proof)
        removal.verify_proof(self.slot, parked, parked_proof)
        other_count = self.require_registrations(competing=True)
        if before != {path.name: fixture_hash(path) for path in paths}:
            raise removal.Refusal('Saved fixture, workspace or preferences changed during replacement')
        self.record('transaction', phase=phase, installed=version, parked=parked,
                    retryVerified=True, repeatVerified=True, competingFixturePresent=True,
                    otherRegistrationCount=other_count, preservedFixtureHashes=before)

    def run(self, prior, candidate):
        self.prepare(prior, candidate)
        self.exercise_editor('baseline', self.old, seed=True)
        self.exercise_finder('baseline', self.old)
        removal.command(removal.PLUGIN, '-a', str(self.competitor / removal.EXT))
        self.require_registrations(competing=True)
        for phase, version, rollback in (('upgrade', self.new, False), ('rollback', self.old, True)):
            self.exercise_transaction(phase, rollback=rollback)
            self.exercise_editor(phase, version)
            self.exercise_finder(phase, version, competing=True)
        if self.saved.read_bytes() != SAVED_TEXT.encode('utf-8'):
            raise removal.Refusal('The saved Markdown fixture changed during the trial')
        self.record('complete', installed=self.old, parked=self.new, savedSha256=fixture_hash(self.saved))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prior', nargs=2, required=True, metavar=('VERSION', 'ABSOLUTE_APP'))
    parser.add_argument('--candidate', nargs=2, required=True, metavar=('VERSION', 'ABSOLUTE_APP'))
    args = parser.parse_args()
    if sys.platform != 'darwin' or platform.machine() != 'arm64' or os.geteuid() == 0 or not sys.stdin.isatty():
        parser.error('Use an interactive Apple silicon macOS session at ordinary user privilege')
    signal.signal(signal.SIGTERM, removal.interrupted)
    old, prior = args.prior
    new, candidate = args.candidate
    trial = None
    try:
        update.validate_versions(old, new)
        prior, candidate = removal.checked_path(prior), removal.checked_path(candidate)
        if input('Type disposable to confirm this is an isolated test account or disposable VM: ') != 'disposable':
            raise removal.Refusal('An isolated desktop was not confirmed')
        trial = Trial(Path(tempfile.mkdtemp(prefix='markwriter-update-trial-', dir='/private/tmp')), old, new)
        print(f'Trial directory and evidence: {trial.root}', flush=True)
        trial.run(prior, candidate)
    except (removal.Refusal, OSError, ValueError, KeyError, subprocess.SubprocessError, KeyboardInterrupt, EOFError) as exc:
        if trial:
            trial.record('incomplete', error=str(exc))
        print(f'Trial incomplete: {exc}', file=sys.stderr)
        return 1
    print(f'Trial complete. Retain {trial.root / "receipt.jsonl"} and the Finder log evidence.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
