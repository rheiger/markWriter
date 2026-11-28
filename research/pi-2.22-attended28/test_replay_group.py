import json
from pathlib import Path
import shutil
import tempfile
import unittest

import replay_group


class GroupReplayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.capture = self.root / 'capture'
        shutil.copytree(Path(__file__).parent / 'open-group', self.capture)
        self.out = self.root / 'result.json'

    def write_events(self, events):
        (self.capture / 'renderer.ndjson').write_text(''.join(json.dumps(row) + '\n' for row in events))

    def events(self):
        return [json.loads(line) for line in (self.capture / 'renderer.ndjson').read_text().splitlines()]

    def test_real_group_has_two_signed_processes_and_nine_completed_requests(self):
        replay_group.replay(self.capture, self.out)
        result = json.loads(self.out.read_text())
        self.assertEqual(result['processIds'], [15947, 16783])
        self.assertEqual(result['requestCount'], 9)
        self.assertIn('cannot be assigned', result['scope'])

    def test_incomplete_or_foreign_request_is_rejected(self):
        events = self.events()
        for mutation in ('missing_completion', 'foreign_path'):
            changed = [dict(event) for event in events]
            if mutation == 'missing_completion':
                changed.pop()
            else:
                changed[0]['processImagePath'] = '/other/QuickLookPrototype'
            self.write_events(changed)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                replay_group.replay(self.capture, self.out)

    def test_missing_dynamic_process_identity_is_rejected(self):
        path = self.capture / 'result.json'
        report = json.loads(path.read_text())
        del report['identities']['16783']
        path.write_text(json.dumps(report))
        with self.assertRaises(ValueError):
            replay_group.replay(self.capture, self.out)

    def test_consistently_rewritten_fixture_hashes_are_rejected(self):
        expected = replay_group.EXPECTED_FIXTURES['legacy']
        for name in ('fixtures-original.sha256', 'fixture-hashes-before.txt', 'fixture-hashes-after.txt'):
            path = self.capture / name
            path.write_text(path.read_text().replace(expected, '0' * 64))
        with self.assertRaises(ValueError):
            replay_group.replay(self.capture, self.out)

    def test_changed_secondary_fixture_is_rejected(self):
        path = self.capture / 'negative-a831f905.md'
        path.write_text(path.read_text() + '\nchanged\n')
        with self.assertRaises(ValueError):
            replay_group.replay(self.capture, self.out)


if __name__ == '__main__':
    unittest.main()
