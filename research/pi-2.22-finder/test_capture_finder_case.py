import datetime
import io
import json
from pathlib import Path
import queue
import signal
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import capture_finder_case as capture

EXE = Path("/test-candidate/QuickLookPrototype")
IMAGE = "7d366e76-1b97-4c41-83e4-cc4c7ec44690"
REQUEST = "4057a9fb-0a96-4c1e-ab46-cfd4ee5db6de"
PID = 381
INJECTION = {"requestId": REQUEST, "pid": PID, "seconds": 8.25}


def fixture(states):
    return [{"eventType": "logEvent", "eventMessage": f"request={REQUEST} {state}",
             "timestamp": f"2026-11-26 18:05:3{index}.200000+0100", "processID": PID,
             "processImageUUID": IMAGE.upper(), "processImagePath": str(EXE)}
            for index, state in enumerate(states)]


def correlate(events, case="timeout", injection=INJECTION):
    return capture.summarize(events, EXE, IMAGE, case, {PID: {"birth": "start time"}}, injection)


class CaptureTests(unittest.TestCase):
    def test_nominal_and_timeout_forms(self):
        self.assertEqual(correlate(fixture(["start", "completed elapsed_ms=450"]), "sequence")["elapsedMs"], 450)
        for spelling in ("timeout", "Fallback: renderer timed out"):
            with self.subTest(spelling=spelling):
                result = correlate(fixture(["start", spelling, "fallback elapsed_ms=8582"]))
                self.assertEqual(result["requestId"], REQUEST)
                self.assertEqual(result["states"], ["start", "timeout", "fallback"])

    def test_other_path_image_pid_request_or_timestamp(self):
        for key, change in (("processImagePath", "/installed/QuickLookPrototype"),
                            ("processImageUUID", "wrong"), ("processID", 382),
                            ("timestamp", "2026-11-26 18:06:00.200000+0100"),
                            ("eventMessage", "request=4057a9fb-0a96-4c1e-ab46-cfd4ee5db6df timeout")):
            with self.subTest(key=key):
                events = fixture(["start", "timeout", "fallback elapsed_ms=8400"])
                events[1][key] = change
                with self.assertRaises(ValueError):
                    correlate(events)

    def test_incomplete_or_ambiguous_intervals(self):
        for states in ([], ["start", "fallback elapsed_ms=8400"], ["start", "timeout"],
                       ["start", "completed elapsed_ms=123", "start", "timeout", "fallback elapsed_ms=8400"],
                       ["start elapsed_ms=1", "timeout", "fallback elapsed_ms=8400"]):
            with self.subTest(states=states), self.assertRaises(ValueError):
                correlate(fixture(states))
        with self.assertRaises(ValueError):
            correlate(fixture(["start", "timeout", "fallback elapsed_ms=8400"]), injection=None)

    def test_stream_filters_metadata(self):
        events = fixture(["start", "completed elapsed_ms=300"])
        sink = queue.Queue()
        capture.read_stream(io.StringIO("\n".join(json.dumps(e) for e in [{}, *events])), sink)
        self.assertEqual([sink.get_nowait() for _ in range(3)], [*events, None])

    def test_resume_refuses_reused_pid(self):
        with patch.object(capture, "stamp", return_value=(EXE, "replacement birth")), patch.object(capture.os, "kill") as kill:
            with self.assertRaises(ValueError):
                capture.resume(PID, EXE, "original birth")
            kill.assert_not_called()
        with patch.object(capture, "stamp", return_value=(EXE, "original birth")), patch.object(capture.os, "kill") as kill:
            capture.resume(PID, EXE, "original birth")
            kill.assert_called_once_with(PID, signal.SIGCONT)

    def test_dynamic_identity_checks_process_before_and_after_codesign(self):
        with patch.object(capture, "stamp", side_effect=[(EXE, "birth"), (EXE, "replacement")]), patch.object(capture, "run", return_value="dynamically valid") as run:
            with self.assertRaises(ValueError):
                capture.signed_identity(PID, EXE, 'cdhash H"fake"')
            self.assertEqual(run.call_args.args[-2:], ('-R=cdhash H"fake"', str(PID)))

    def test_exact_mac_python_offset_format(self):
        actual = capture.event_time({"timestamp": "2026-11-26 19:26:52.054783+0100"})
        expected = datetime.datetime(2026, 11, 26, 18, 26, 52, 54783, tzinfo=datetime.timezone.utc)
        self.assertEqual(actual, expected)
        self.assertEqual(actual, capture.event_time({"timestamp": "2026-11-26T18:26:52.054783Z"}))
        with self.assertRaises(ValueError):
            capture.event_time({"timestamp": "2026-11-26T18:26:52.054783"})

    def test_normal_interval_requires_all_completed_one_pid(self):
        events = fixture(["start", "completed elapsed_ms=405", "start", "completed elapsed_ms=104"])
        for event in events[2:]:
            event["eventMessage"] = event["eventMessage"].replace(REQUEST, IMAGE)
        summary = capture.normal_interval(events, EXE, IMAGE, "sequence", {PID: {}})
        self.assertEqual([item["elapsedMs"] for item in summary], [405, 104])
        with self.assertRaises(ValueError):
            capture.normal_interval(events, EXE, IMAGE, "timeout", {PID: {}})
        for event in events[2:]:
            event["processID"] = PID + 1
        with self.assertRaises(ValueError):
            capture.normal_interval(events, EXE, IMAGE, "sequence", {PID: {}, PID + 1: {}})
        events[1]["eventMessage"] = events[1]["eventMessage"].replace("completed", "fallback")
        with self.assertRaises(ValueError):
            capture.normal_interval(events, EXE, IMAGE, "sequence", {PID: {}, PID + 1: {}})

    def test_replay_preserves_original_and_checks_inputs(self):
        with tempfile.TemporaryDirectory() as name:
            directory = Path(name)
            fixture_file = directory / "test.md"
            fixture_file.write_text("# synthetic")
            extension = Path("/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex")
            args = SimpleNamespace(capture_dir=directory, fixture=fixture_file, case="timeout", extension=extension,
                                   cdhash="a" * 40, image_uuid=IMAGE, out=directory / "new.json", normal_interval=False)
            (directory / "stop").touch()
            events = fixture(["start", "timeout", "fallback elapsed_ms=8400"])
            for event in events:
                event["processImagePath"] = str(extension / "Contents/MacOS/QuickLookPrototype")
            (directory / "renderer.ndjson").write_text("".join(json.dumps(event) + "\n" for event in events))
            result = {"case": "timeout", "correlated": False, "error": "Invalid isoformat string: 'raw'",
                      "readyUtc": "2026-11-26T17:00:00Z", "imageUuid": IMAGE, "extension": str(extension),
                      "cdhash": args.cdhash, "scriptSha256": "a" * 64, "executableSha256": "b" * 64,
                      "fixture": fixture_file.name, "fixtureSha256": capture.sha256(fixture_file), "suspension": INJECTION,
                      "staticSeal": f"{extension}: valid on disk\n{extension}: explicit requirement satisfied",
                      "identities": {str(PID): {"birth": "recorded", "dynamicVerification":
                                                f"{PID}: dynamically valid\n{PID}: explicit requirement satisfied"}}}
            source = directory / "result.json"
            capture.write_receipt(source, result)
            original_hash = capture.sha256(source)
            capture.replay(args)
            self.assertEqual(capture.sha256(source), original_hash)
            self.assertTrue(json.loads(args.out.read_text())["singleRequestInInterval"])
            args.out = source
            with self.assertRaises(FileExistsError):
                capture.replay(args)
            self.assertEqual(capture.sha256(source), original_hash)
            args.out = directory / "invalid.json"
            for bad in ({"cdhash": "0"*40}, {"suspension": None}, {"fixtureSha256": "0"*64},
                        {"identities": {}}, {"staticSeal": ""}, {"error": "log stream failed"}):
                with self.subTest(bad=bad), self.assertRaises(ValueError):
                    capture.write_receipt(source, {**result, **bad})
                    capture.replay(args)
                self.assertFalse(args.out.exists())
