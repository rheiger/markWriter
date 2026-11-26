import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import exchange


class RestorationTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.session = Path(temp.name)
        self.app = self.session / "MarkWriter.app"
        self.holding = self.session / "holding"
        self.app.mkdir()
        self.holding.mkdir()
        self.patches = {}
        for name in ("APP", "ensure_editor_idle", "stop_extension", "remove_registration",
                     "exchange", "register", "registration", "contents", "defaults"):
            patch = mock.patch.object(exchange, name, self.app) if name == "APP" else mock.patch.object(exchange, name)
            self.patches[name] = patch.start()
            self.addCleanup(patch.stop)
        self.patches["exchange"].side_effect = self.simulate_exchange
        self.patches["contents"].return_value = {"hash": "original"}
        self.patches["defaults"].return_value = {"fixture": "default"}
        self.patches["registration"].return_value = "new"
        self.data = dict(original_inode=exchange.identity(self.app),
                         candidate_inode=exchange.identity(self.holding),
                         defaults={"fixture": "default"}, original={"hash": "original"},
                         original_uuid="old", phase="exchanging", owner=12345)
        exchange.write_json(self.session / "state.json", self.data)

    def simulate_exchange(self, left, right):
        temp = self.session / "internal"
        os.rename(left, temp)
        os.rename(right, left)
        os.rename(temp, right)

    def test_restore_after_exchange_before_registration_or_completion(self):
        self.simulate_exchange(self.app, self.holding)
        self.patches["registration"].side_effect = [RuntimeError("missing"), "new"]
        exchange.restore(self.session)
        self.assertEqual(exchange.identity(self.app), self.data["original_inode"])
        self.assertEqual(exchange.identity(self.holding), self.data["candidate_inode"])
        state = json.loads((self.session / "state.json").read_text())
        self.assertEqual(state["phase"], "restored")
        self.assertTrue(state["uuid_changed"])
        exchange.restore(self.session)
        self.patches["register"].assert_called_once()
        self.patches["exchange"].assert_called_once()

    def test_if_death_precedes_exchange_registration_is_repaired(self):
        self.patches["registration"].side_effect = [RuntimeError("missing"), "new"]
        exchange.restore(self.session)
        self.patches["exchange"].assert_not_called()
        self.patches["register"].assert_called_once()

    def test_verify_retry_leaves_already_restored_registration_alone(self):
        self.patches["defaults"].return_value = {"fixture": "different"}
        with self.assertRaisesRegex(RuntimeError, "comparison differs"):
            exchange.restore(self.session)
        self.patches["register"].assert_not_called()
        self.patches["defaults"].return_value = self.data["defaults"]
        exchange.restore(self.session)
        self.patches["exchange"].assert_not_called()
        self.patches["register"].assert_not_called()

    def test_unrecognized_mapping_is_preserved(self):
        self.holding.rename(self.session / "moved")
        self.holding.mkdir()
        with self.assertRaisesRegex(RuntimeError, "identities differ"):
            exchange.restore(self.session)
        self.patches["register"].assert_not_called()
        self.patches["exchange"].assert_not_called()

    def test_editor_running_blocks_restore_before_mutation(self):
        self.simulate_exchange(self.app, self.holding)
        self.patches["ensure_editor_idle"].side_effect = RuntimeError("editor running")
        with self.assertRaisesRegex(RuntimeError, "editor running"):
            exchange.restore(self.session)
        self.patches["exchange"].assert_not_called()
        self.patches["remove_registration"].assert_not_called()

    def test_unrelated_controller_cannot_roll_back_active_trial_on_start_failure(self):
        self.simulate_exchange(self.app, self.holding)
        exchange.restore(self.session, owner=98765)
        self.patches["exchange"].assert_not_called()
        self.patches["remove_registration"].assert_not_called()


if __name__ == "__main__":
    unittest.main()
