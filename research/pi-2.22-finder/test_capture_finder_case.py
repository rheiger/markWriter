import io
import json
from pathlib import Path
import queue
import signal
import unittest
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
