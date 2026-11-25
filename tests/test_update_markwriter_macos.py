import importlib.util
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
import unicodedata
from unittest.mock import call, patch


TOOL = Path(__file__).resolve().parents[1] / 'tools/update-markwriter-macos.py'
SPEC = importlib.util.spec_from_file_location('macos_update', TOOL)
update = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(update)
removal = update.removal
OLD, NEW = '2.13.3', '2.14.3'


def bundle(path, version, *, native=False):
    build = version.replace('.', '')
    for target, executable, bundle_id, package_type in (
        (path / removal.EXT, 'QuickLookPrototype', 'com.markwriter.app.quicklook', 'XPC!'),
        (path, 'markwriter', 'com.markwriter.app', 'APPL'),
    ):
        contents = target / 'Contents'
        binary = contents / 'MacOS' / executable
        binary.parent.mkdir(parents=True)
        resources = contents / 'Resources'
        resources.mkdir()
        (resources / 'fixture.txt').write_text(f'synthetic data for {version}\n')
        metadata = {
            'CFBundleExecutable': executable,
            'CFBundleIdentifier': bundle_id,
            'CFBundleName': 'MarkWriter Update Test',
            'CFBundlePackageType': package_type,
            'CFBundleShortVersionString': version,
            'CFBundleVersion': build,
        }
        if package_type == 'XPC!':
            metadata['NSExtension'] = {
                'NSExtensionPointIdentifier': 'com.apple.quicklook.preview',
            }
        (contents / 'Info.plist').write_bytes(plistlib.dumps(metadata))
        if native:
            subprocess.run(['/usr/bin/clang', '-x', 'c', '-', '-o', str(binary)],
                           input=f'#include <stdio.h>\nint main(void) {{ puts("{version}"); }}\n',
                           text=True, check=True, timeout=20)
            subprocess.run([removal.CODESIGN, '--force', '--sign', '-', '--identifier',
                            bundle_id, str(target)], check=True, timeout=20)
        else:
            binary.write_text(f'synthetic executable for {version}')
            signature = contents / '_CodeSignature/CodeResources'
            signature.parent.mkdir()
            signature.write_text(f'synthetic seal for {version}')


def version(app):
    return plistlib.loads((app / 'Contents/Info.plist').read_bytes())['CFBundleShortVersionString']


class HardCrash(BaseException):
    pass


class Trial(unittest.TestCase):
    def setUp(self):
        temp_root = '/private/tmp' if sys.platform == 'darwin' else None
        temp = tempfile.TemporaryDirectory(prefix='markwriter-update-test-', dir=temp_root)
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name).resolve()
        self.app = self.root / 'Update Test ü.app'
        self.stage = update.staging_dir(self.app)
        self.stage.mkdir(mode=0o700)
        self.slot = self.stage / update.STAGED_BUNDLE

    def run_tool(self, apply=False, rollback=False, old=OLD, new=NEW):
        return update.run(self.app, old, new, apply=apply, rollback=rollback)


class TransactionTest(Trial):
    def setUp(self):
        super().setUp()
        bundle(self.app, OLD)
        bundle(self.slot, NEW)
        self.other = self.root / 'Competing.app'
        bundle(self.other, NEW)
        self.profile = self.root / 'profile.json'
        self.profile.write_bytes(b'{"unsaved":"synthetic draft"}\n')
        self.registrations = {str(self.app / removal.EXT), str(self.other / removal.EXT)}
        self.calls = []
        for target, name, kwargs in (
            (removal, 'command', {'side_effect': self.command}),
            (removal, 'registration_paths', {'side_effect': lambda: sorted(self.registrations)}),
            (removal, 'assert_stopped', {}),
            (removal, 'rename_exclusive', {'side_effect': os.rename}),
            (update, 'exchange_paths', {'side_effect': self.fake_swap}),
        ):
            patcher = patch.object(target, name, **kwargs)
            setattr(self, 'mock_' + name, patcher.start())
            self.addCleanup(patcher.stop)

    def fake_swap(self, app, slot, app_proof, slot_proof):
        parked = self.stage / 'test-only-parked'
        self.assertEqual(removal.entry_identity(app), app_proof[:2])
        self.assertEqual(removal.entry_identity(slot), slot_proof[:2])
        app.rename(parked)
        slot.rename(app)
        parked.rename(slot)

    def command(self, *args):
        self.calls.append(args)
        if args[:2] == (removal.PLUGIN, '-a'):
            self.registrations.add(args[2])
        if args[:2] == (removal.PLUGIN, '-r'):
            self.registrations.remove(args[2])

    def assert_pair(self, selected, retained, registered=True):
        self.assertEqual((version(self.app), version(self.slot)), (selected, retained))
        self.assertEqual(self.profile.read_bytes(), b'{"unsaved":"synthetic draft"}\n')
        self.assertEqual(version(self.other), NEW)
        if registered:
            self.assertEqual(self.registrations, {str(self.app / removal.EXT), str(self.other / removal.EXT)})
        self.assertFalse(any(str(self.other) in arg for call in self.calls for arg in call))

    def test_dry_run_and_two_reversible_versions_keep_path_scope(self):
        self.run_tool()
        self.assertFalse((self.stage / update.JOURNAL).exists())
        self.assertFalse((self.root / removal.QUARANTINE).exists())
        self.assert_pair(OLD, NEW)
        self.run_tool(apply=True)
        self.assert_pair(NEW, OLD)
        self.run_tool(apply=True)
        self.assert_pair(NEW, OLD)
        self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW)
        self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW)
        self.assertEqual(self.mock_exchange_paths.call_count, 2)

    def test_interrupted_install_resumes_without_swapping_back(self):
        def crash_after_swap(*args):
            self.fake_swap(*args)
            raise HardCrash()
        self.mock_exchange_paths.side_effect = crash_after_swap
        with self.assertRaises(HardCrash):
            self.run_tool(apply=True)
        self.assert_pair(NEW, OLD, registered=False)
        self.mock_exchange_paths.side_effect = self.fake_swap
        self.run_tool(apply=True)
        self.assert_pair(NEW, OLD)
        self.assertEqual(self.mock_exchange_paths.call_count, 1)

    def test_interrupted_rollback_can_restore_registration(self):
        self.run_tool(apply=True)

        def crash_after_swap(*args):
            self.fake_swap(*args)
            raise HardCrash()
        self.mock_exchange_paths.side_effect = crash_after_swap
        with self.assertRaises(HardCrash):
            self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW, registered=False)
        self.mock_exchange_paths.side_effect = self.fake_swap
        self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW)
        self.assertEqual(self.mock_exchange_paths.call_count, 2)

    def test_registration_failure_leaves_both_versions_available_for_rollback(self):
        def fail_registration(*args):
            if args[:2] == (removal.PLUGIN, '-a'):
                raise subprocess.CalledProcessError(1, args)
            self.command(*args)
        self.mock_command.side_effect = fail_registration
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_tool(apply=True)
        self.assert_pair(NEW, OLD, registered=False)
        self.mock_command.side_effect = self.command
        self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW)

    def test_failed_exchange_can_repair_current_registration(self):
        self.mock_exchange_paths.side_effect = OSError('swap unsupported')
        with self.assertRaises(OSError):
            self.run_tool(apply=True)
        self.assert_pair(OLD, NEW, registered=False)
        self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW)

    def test_matching_unicode_missing_plugin_replies_require_independent_absence(self):
        extension = str(self.app / removal.EXT)

        def report_missing_plugin(*args):
            if args[:2] == (removal.PLUGIN, '-r'):
                message = unicodedata.normalize('NFD', f'remove: no plugin at {extension}')
                raise subprocess.CalledProcessError(1, args, stderr=message)
            self.command(*args)

        self.mock_command.side_effect = report_missing_plugin
        with self.assertRaisesRegex(removal.Refusal, 'outgoing registration removal'):
            self.run_tool(apply=True)
        self.assert_pair(OLD, NEW)
        self.mock_exchange_paths.assert_not_called()

        def clear_after_unknown_unicode_removal(*args):
            if args[:2] == (removal.LSREGISTER, '-u'):
                self.registrations.remove(extension)
            report_missing_plugin(*args)

        self.mock_command.side_effect = clear_after_unknown_unicode_removal
        self.run_tool(apply=True)
        self.assert_pair(NEW, OLD)

    def test_successful_remove_command_with_stale_record_refuses_swap(self):
        def leave_stale_record(*args):
            if args[:2] != (removal.PLUGIN, '-r'):
                self.command(*args)

        self.mock_command.side_effect = leave_stale_record
        with self.assertRaisesRegex(removal.Refusal, 'outgoing registration removal'):
            self.run_tool(apply=True)
        self.assert_pair(OLD, NEW)
        self.mock_exchange_paths.assert_not_called()

    def test_unrelated_plugin_error_refuses_swap(self):
        def unrelated_error(*args):
            if args[:2] == (removal.PLUGIN, '-r'):
                raise subprocess.CalledProcessError(1, args, stderr=f'remove: no plugin at {self.other}')
            self.command(*args)

        self.mock_command.side_effect = unrelated_error
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_tool(apply=True)
        self.assert_pair(OLD, NEW)
        self.mock_exchange_paths.assert_not_called()

    def test_retry_after_post_exchange_sync_failure_syncs_both_directories(self):
        def swap_then_fail_sync(*args):
            self.fake_swap(*args)
            raise OSError('directory sync failed after the exchange')

        self.mock_exchange_paths.side_effect = swap_then_fail_sync
        with self.assertRaisesRegex(OSError, 'directory sync failed'):
            self.run_tool(apply=True)
        self.assert_pair(NEW, OLD, registered=False)
        with patch.object(removal, 'sync_directory', wraps=removal.sync_directory) as sync:
            self.run_tool(apply=True)
        self.assertEqual(sync.call_args_list, [call(self.root), call(self.stage)])
        self.assertEqual(self.mock_exchange_paths.call_count, 1)
        self.assert_pair(NEW, OLD)

    def test_record_refuses_substituted_copy_and_unsafe_record(self):
        self.run_tool(apply=True)
        saved = self.stage / 'prior.app'
        self.slot.rename(saved)
        shutil.copytree(saved, self.slot)
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True, rollback=True)
        self.assert_pair(NEW, OLD)
        self.slot.rename(self.stage / 'impostor.app')
        saved.rename(self.slot)
        (self.stage / update.JOURNAL).chmod(0o644)
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True, rollback=True)
        self.assert_pair(NEW, OLD)

    def test_invalid_versions_running_app_or_registered_stage_refuse_before_swap(self):
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True, new=OLD)
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True, new=NEW + '-rc1')
        self.mock_assert_stopped.side_effect = removal.Refusal('running')
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True)
        self.mock_assert_stopped.side_effect = None
        self.registrations.add(str(self.slot / removal.EXT))
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True)
        self.mock_exchange_paths.assert_not_called()
        self.assertFalse((self.stage / update.JOURNAL).exists())

    def test_rollback_from_missing_journal_refuses(self):
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True, rollback=True)
        self.assert_pair(OLD, NEW)

    def test_symlinked_stage_refuses(self):
        parked = self.root / 'parked'
        self.stage.rename(parked)
        self.stage.symlink_to(parked, target_is_directory=True)
        with self.assertRaises(removal.Refusal):
            self.run_tool(apply=True)
        self.mock_exchange_paths.assert_not_called()


@unittest.skipUnless(sys.platform == 'darwin', 'requires macOS codesign and atomic swap')
class MacOSTransactionTest(Trial):
    def test_signed_fixtures_swap_and_rollback_on_the_same_path(self):
        bundle(self.app, OLD, native=True)
        bundle(self.slot, NEW, native=True)
        registered = set()
        command = removal.command
        exchange = update.exchange_paths
        fixture_document = self.root / 'synthetic.md'
        fixture_document.write_bytes(b'# Saved before replacement\n')
        fixture_profile = self.root / 'profile.json'
        fixture_profile.write_bytes(b'{"unsaved":"fixture draft"}\n')

        def interrupted_exchange(*args):
            exchange(*args)
            raise HardCrash()

        def isolated_command(*args):
            if args[0] == removal.CODESIGN:
                return command(*args)
            if args[:2] == (removal.PLUGIN, '-a'):
                registered.add(args[2])
            elif args[:2] == (removal.PLUGIN, '-r'):
                registered.remove(args[2])
            else:
                self.assertEqual(args[0], removal.LSREGISTER)

        def launch(app):
            return subprocess.check_output([app / 'Contents/MacOS/markwriter'],
                                           text=True, timeout=5).strip()
        with patch.object(removal, 'command', side_effect=isolated_command), \
                patch.object(removal, 'registration_paths', side_effect=lambda: list(registered)):
            self.assertEqual(launch(self.app), OLD)
            with patch.object(update, 'exchange_paths', side_effect=interrupted_exchange):
                with self.assertRaises(HardCrash):
                    self.run_tool(apply=True)
            self.assertEqual(launch(self.app), NEW)
            self.assertEqual(version(self.slot), OLD)
            self.run_tool(apply=True)
            self.assertEqual(launch(self.app), NEW)
            self.assertEqual(version(self.slot), OLD)
            self.run_tool(apply=True, rollback=True)
            self.assertEqual(launch(self.app), OLD)
            self.assertEqual(version(self.slot), NEW)
            self.assertEqual(fixture_document.read_bytes(), b'# Saved before replacement\n')
            self.assertEqual(fixture_profile.read_bytes(), b'{"unsaved":"fixture draft"}\n')


if __name__ == '__main__':
    unittest.main()
