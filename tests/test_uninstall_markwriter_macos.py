import importlib.util
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import unicodedata
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('uninstall', Path(__file__).resolve().parents[1] / 'tools/uninstall-markwriter-macos.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class RemovalTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/private/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / 'custom ü' / 'MarkWriter.app'
        self.app.parent.mkdir()
        self.extension = self.app / u.EXT
        (self.app / 'Contents/MacOS').mkdir(parents=True)
        (self.app / 'Contents/MacOS/markwriter').write_text('synthetic')
        (self.extension / 'Contents/MacOS').mkdir(parents=True)
        (self.extension / 'Contents/MacOS/QuickLookPrototype').write_text('synthetic')
        self.host = {'CFBundlePackageType': 'APPL', 'CFBundleExecutable': 'markwriter', 'CFBundleIdentifier': 'com.markwriter.app', 'CFBundleShortVersionString': '2.7.3', 'CFBundleVersion': '273'}
        self.ext = {'CFBundleExecutable': 'QuickLookPrototype', 'CFBundlePackageType': 'XPC!', 'CFBundleIdentifier': 'com.markwriter.app.quicklook', 'CFBundleShortVersionString': '2.7.3', 'CFBundleVersion': '273', 'NSExtension': {'NSExtensionPointIdentifier': 'com.apple.quicklook.preview'}}
        self.write_plists()
        for bundle in (self.app, self.extension):
            signature = bundle / 'Contents/_CodeSignature/CodeResources'
            signature.parent.mkdir()
            signature.write_text('synthetic seal')
        self.calls = []
        self.commands = patch.object(u, 'command', side_effect=lambda *args: self.calls.append(args))
        self.commands.start()
        self.addCleanup(self.commands.stop)
        self.stopped = patch.object(u, 'assert_stopped')
        self.stopped.start()
        self.addCleanup(self.stopped.stop)
        self.backup = self.app.parent / u.QUARANTINE / (self.app.name + '.2.7.3.quarantined')

    def write_plists(self):
        for path, value in [(self.app / 'Contents/Info.plist', self.host), (self.extension / 'Contents/Info.plist', self.ext)]:
            path.write_bytes(plistlib.dumps(value))

    def test_dry_run_has_no_mutation_or_registration(self):
        u.run(self.app, '2.7.3')
        self.assertTrue(self.app.exists())
        self.assertFalse(self.backup.parent.exists())
        self.assertEqual([c[0] for c in self.calls], [u.CODESIGN, u.CODESIGN, u.CODESIGN])

    def test_remove_repeat_restore_and_survival(self):
        doc = self.root / 'document.md'; doc.write_text('draft')
        profile = self.root / 'profile'; profile.write_text('recovery')
        other = self.root / 'other' / 'MarkWriter.app'; other.mkdir(parents=True)
        u.run(self.app, '2.7.3', True)
        self.assertFalse(self.app.exists()); self.assertTrue(self.backup.exists())
        self.assertIn((u.PLUGIN, '-r', str(self.extension)), self.calls)
        self.assertIn((u.LSREGISTER, '-u', str(self.app)), self.calls)
        u.run(self.app, '2.7.3', True)
        u.run(self.app, '2.7.3', True, True)
        self.assertTrue(self.app.exists()); self.assertFalse(self.backup.exists())
        self.assertIn((u.PLUGIN, '-a', str(self.extension)), self.calls)
        self.assertEqual(doc.read_text(), 'draft'); self.assertEqual(profile.read_text(), 'recovery'); self.assertTrue(other.exists())

    def test_distinct_versions_support_exact_path_upgrade_and_rollback(self):
        self.host['CFBundleShortVersionString'] = self.ext['CFBundleShortVersionString'] = '2.7.2'
        self.write_plists()
        old = self.app.parent / u.QUARANTINE / (self.app.name + '.2.7.2.quarantined')
        u.run(self.app, '2.7.2', True)
        self.assertTrue(old.exists())
        shutil.copytree(old, self.app)
        self.host['CFBundleShortVersionString'] = self.ext['CFBundleShortVersionString'] = '2.7.3'
        self.write_plists()
        u.run(self.app, '2.7.3', True)
        self.assertTrue(old.exists()); self.assertTrue(self.backup.exists())
        u.run(self.app, '2.7.2', True, True)
        self.assertTrue(self.app.exists()); self.assertTrue(self.backup.exists())
        with (self.app / 'Contents/Info.plist').open('rb') as file:
            self.assertEqual(plistlib.load(file)['CFBundleShortVersionString'], '2.7.2')
        with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True, True)

    def test_invalid_versions_are_refused_before_any_mutation(self):
        for version in ('../escape', '', '.', '2.7.3/other', '2.7.3\\other', '２.7.3', '2.7.3..', 'x' * 300):
            with self.assertRaises(u.Refusal): u.run(self.app, version, True)
        self.assertFalse((self.app.parent / u.QUARANTINE).exists())
        self.assertTrue(self.app.exists())

    def test_rejects_identity_build_and_extension_changes(self):
        for key, value in [('CFBundleIdentifier', 'other'), ('CFBundleShortVersionString', '2.7.2'), ('CFBundleVersion', 'other')]:
            original = self.ext[key]; self.ext[key] = value; self.write_plists()
            with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
            self.ext[key] = original
        self.write_plists()
        (self.app / 'Contents/PlugIns/Other.appex').mkdir()
        with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
        self.assertTrue(self.app.exists())

    def test_failure_restores_registration_and_retry(self):
        def fail(*args):
            self.calls.append(args)
            if args[:2] == (u.LSREGISTER, '-u'): raise subprocess.CalledProcessError(1, args)
        with patch.object(u, 'command', side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError): u.run(self.app, '2.7.3', True)
        self.assertTrue(self.app.exists())
        self.assertIn((u.PLUGIN, '-a', str(self.extension)), self.calls)
        u.run(self.app, '2.7.3', True)
        self.assertTrue(self.backup.exists())

    def test_running_and_conflicting_backup_refused(self):
        with patch.object(u, 'assert_stopped', side_effect=u.Refusal('running')):
            with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
        self.backup.mkdir(parents=True, mode=0o700)
        with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
        self.assertTrue(self.app.exists())

    def test_interrupted_restore_can_repair_registration(self):
        u.run(self.app, '2.7.3', True)
        def fail(*args):
            self.calls.append(args)
            if args[:2] == (u.PLUGIN, '-a'): raise subprocess.CalledProcessError(1, args)
        with patch.object(u, 'command', side_effect=fail):
            with self.assertRaises(subprocess.CalledProcessError): u.run(self.app, '2.7.3', True, True)
        self.assertTrue(self.app.exists())
        u.run(self.app, '2.7.3', True, repair=True)
        self.assertIn((u.PLUGIN, '-a', str(self.extension)), self.calls)

    def test_path_and_symlinks_rejected(self):
        for path in ['relative/MarkWriter.app', '/tmp/../MarkWriter.app', '/MarkWriter.app']:
            with self.assertRaises(u.Refusal): u.checked_path(path)
        link = self.root / 'linked'; link.symlink_to(self.app.parent)
        with self.assertRaises(u.Refusal): u.checked_path(str(link / 'MarkWriter.app'))
        plist = self.extension / 'Contents/Info.plist'; plist.unlink(); plist.symlink_to(self.app / 'Contents/Info.plist')
        with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)

    def test_exclusive_rename_refuses_racing_destination(self):
        original = u.rename_exclusive
        def race(source, destination):
            destination.mkdir()
            original(source, destination)
        with patch.object(u, 'rename_exclusive', side_effect=race):
            with self.assertRaises(OSError): u.run(self.app, '2.7.3', True)
        self.assertTrue(self.app.exists())
        self.assertTrue(self.backup.is_dir())
        self.assertFalse((self.backup / 'Contents').exists())

    def test_parallel_operations_refuse_without_stranding_lock(self):
        entered = threading.Event(); release = threading.Event(); errors = []
        def hold(*args):
            entered.set(); release.wait(5)
        def first():
            try:
                with patch.object(u, 'register', side_effect=hold):
                    u.run(self.app, '2.7.3', True, repair=True)
            except BaseException as error: errors.append(error)
        thread = threading.Thread(target=first); thread.start()
        self.assertTrue(entered.wait(5))
        try:
            with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
        finally:
            release.set(); thread.join(5)
        self.assertFalse(thread.is_alive()); self.assertFalse(errors)
        u.run(self.app, '2.7.3', True)
        self.assertTrue(self.backup.exists())

    def test_terminated_process_releases_transaction_lock(self):
        program = """import importlib.util, pathlib, sys, time
spec = importlib.util.spec_from_file_location('u', sys.argv[1]); u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)
app = pathlib.Path(sys.argv[2])
with u.transaction_lock(app.parent / u.QUARANTINE, app):
 print('locked', flush=True)
 time.sleep(30)
"""
        child = subprocess.Popen([sys.executable, '-c', program, str(Path(u.__file__)), str(self.app)], stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), 'locked')
            with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
        finally:
            child.terminate(); child.wait(timeout=5); child.stdout.close()
        u.run(self.app, '2.7.3', True)
        self.assertTrue(self.backup.exists())

    def test_interruption_between_deregistration_steps_rolls_back(self):
        def interrupt(*args):
            self.calls.append(args)
            if args[:2] == (u.LSREGISTER, '-u'): raise KeyboardInterrupt('injected')
        with patch.object(u, 'command', side_effect=interrupt):
            with self.assertRaises(KeyboardInterrupt): u.run(self.app, '2.7.3', True)
        self.assertTrue(self.app.exists())
        self.assertIn((u.PLUGIN, '-a', str(self.extension)), self.calls)
        u.run(self.app, '2.7.3', True)
        self.assertTrue(self.backup.exists())

    def test_custom_unicode_bundle_and_unsafe_directory(self):
        renamed = self.app.with_name('MarkWriter 瑞典.app')
        self.app.rename(renamed)
        self.assertEqual(u.checked_path(str(renamed)), renamed)
        u.run(renamed, '2.7.3', True)
        self.assertTrue(renamed.parent.joinpath(u.QUARANTINE, renamed.name + '.2.7.3.quarantined').exists())
        os.chmod(self.app.parent, 0o777)
        with self.assertRaises(u.Refusal): u.checked_path(str(renamed))

    def test_executable_metadata_and_signature_identifier_are_required(self):
        self.ext['CFBundleExecutable'] = 'other'; self.write_plists()
        with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3')
        self.ext['CFBundleExecutable'] = 'QuickLookPrototype'; self.write_plists()
        u.run(self.app, '2.7.3')
        self.assertTrue(any('com.markwriter.app.quicklook' in ' '.join(c) for c in self.calls))
        self.assertTrue(any('com.markwriter.app"' in ' '.join(c) for c in self.calls))

    def test_bundle_drift_during_deregistration_is_refused(self):
        def drift(*args):
            self.calls.append(args)
            if args[:2] == (u.LSREGISTER, '-u'):
                (self.app / 'Contents/MacOS/markwriter').write_text('changed')
        with patch.object(u, 'command', side_effect=drift):
            with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)
        self.assertTrue(self.app.exists())
        self.assertFalse(self.backup.exists())
        self.assertNotIn((u.PLUGIN, '-a', str(self.extension)), self.calls)

    def test_running_detection_handles_macos_unicode_and_case_without_other_copy(self):
        original = self.app.with_name('MarkWriter Prüfling.app')
        self.app.rename(original)
        running = unicodedata.normalize('NFD', str(original / 'Contents/MacOS/markwriter'))
        self.assertTrue(Path(running).exists(), 'This regression requires a Unicode-normalizing macOS volume')
        alternative_case = running.replace('MarkWriter Pru', 'MARKWRITER PRU')
        self.assertTrue(Path(alternative_case).exists(), 'This regression requires a case-insensitive macOS volume')
        other = original.parent / 'MarkWriter Other.app' / 'Contents/MacOS'
        other.mkdir(parents=True)
        (other / 'markwriter').write_text('other synthetic app')
        self.stopped.stop()
        try:
            with patch.object(u.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=alternative_case + '\n')):
                with self.assertRaises(u.Refusal): u.assert_stopped(original)
            with patch.object(u.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=str(other / 'markwriter') + '\n')):
                u.assert_stopped(original)
        finally:
            self.stopped.start()

    def test_actual_running_unicode_bundle_is_rejected(self):
        original = self.app.with_name('MarkWriter Prüfling.app')
        self.app.rename(original)
        executable = original / 'Contents/MacOS/markwriter'
        shutil.copyfile('/bin/sleep', executable)
        executable.chmod(0o755)
        process = subprocess.Popen([str(executable), '30'])
        self.stopped.stop()
        try:
            with self.assertRaises(u.Refusal): u.assert_stopped(original)
        finally:
            process.terminate(); process.wait(timeout=5)
            self.stopped.start()

    def test_process_check_detects_exact_bundle_prefix(self):
        self.stopped.stop()
        try:
            with patch.object(u.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=str(self.app / 'Contents/MacOS/markwriter') + '\n')):
                with self.assertRaises(u.Refusal): u.assert_stopped(self.app)
        finally:
            self.stopped.start()

if __name__ == '__main__': unittest.main()
