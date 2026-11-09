import importlib.util
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('uninstall', Path(__file__).resolve().parents[1] / 'tools/uninstall-markwriter-macos.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class RemovalTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / 'custom ü' / 'MarkWriter.app'
        self.app.parent.mkdir()
        self.extension = self.app / u.EXT
        (self.app / 'Contents/MacOS').mkdir(parents=True)
        (self.app / 'Contents/MacOS/markwriter').write_text('synthetic')
        (self.extension / 'Contents').mkdir(parents=True)
        self.host = {'CFBundleIdentifier': 'com.markwriter.app', 'CFBundleShortVersionString': '2.7.3', 'CFBundleVersion': '273'}
        self.ext = {'CFBundleIdentifier': 'com.markwriter.app.quicklook', 'CFBundleShortVersionString': '2.7.3', 'CFBundleVersion': '273', 'NSExtension': {'NSExtensionPointIdentifier': 'com.apple.quicklook.preview'}}
        self.write_plists()
        self.calls = []
        self.commands = patch.object(u, 'command', side_effect=lambda *args: self.calls.append(args))
        self.commands.start()
        self.addCleanup(self.commands.stop)
        self.stopped = patch.object(u, 'assert_stopped')
        self.stopped.start()
        self.addCleanup(self.stopped.stop)
        self.backup = self.app.parent / u.QUARANTINE / self.app.name

    def write_plists(self):
        for path, value in [(self.app / 'Contents/Info.plist', self.host), (self.extension / 'Contents/Info.plist', self.ext)]:
            path.write_bytes(plistlib.dumps(value))

    def test_dry_run_has_no_mutation_or_registration(self):
        u.run(self.app, '2.7.3')
        self.assertTrue(self.app.exists())
        self.assertFalse(self.backup.parent.exists())
        self.assertEqual([c[0] for c in self.calls], [u.CODESIGN, u.CODESIGN])

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
        for path in ['relative/MarkWriter.app', '/tmp/../MarkWriter.app', '/tmp/not.app']:
            with self.assertRaises(u.Refusal): u.checked_path(path)
        link = self.root / 'linked'; link.symlink_to(self.app.parent)
        with self.assertRaises(u.Refusal): u.checked_path(str(link / 'MarkWriter.app'))
        plist = self.extension / 'Contents/Info.plist'; plist.unlink(); plist.symlink_to(self.app / 'Contents/Info.plist')
        with self.assertRaises(u.Refusal): u.run(self.app, '2.7.3', True)

    def test_process_check_detects_exact_bundle_prefix(self):
        self.stopped.stop()
        try:
            with patch.object(u.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=str(self.app / 'Contents/MacOS/markwriter') + '\n')):
                with self.assertRaises(u.Refusal): u.assert_stopped(self.app)
        finally:
            self.stopped.start()

if __name__ == '__main__': unittest.main()
