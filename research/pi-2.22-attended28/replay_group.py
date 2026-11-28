"""Validate a stopped, multi-fixture Finder interval without attributing requests to files."""
import argparse
import json
from pathlib import Path

import capture_finder_case as capture

EXTENSION = Path('/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex')
EXECUTABLE = EXTENSION / 'Contents/MacOS/QuickLookPrototype'
CDHASH = 'a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e'
IMAGE_UUID = '25053f44-52cb-3f32-a138-8a3e9c49ae85'
EXECUTABLE_SHA = '401eeecb1117048961103518a0ffa0720766457109c5566dcdde6e0bc950d7ab'
SCRIPT_SHA = 'ddb435c53c82e376588cad4f2e0a68b9f76f9bb858c708c669da8816613e96e3'
CASES = ('open', 'legacy', 'negative', 'oversized')
EXPECTED_FIXTURES = {
    'open': '90948fcff5e7900e44b503e4a061607ba4258f189ff8e4d8a548fe45a6d34d24',
    'legacy': 'd83b549b77f9e6bdbd9fa8d94460b5c307ebe89f37f4582d7d35868e884a6137',
    'negative': 'b48dbbd59e358a79eba0d63f379e7efeabdb8c969618d733101e5fd2b983d6bf',
    'oversized': 'fe713a806867589a7e9cdbd73c123737666e6d37f30eb936ca9b6a6de4e68f7c',
}


def checked(condition, message):
    if not condition:
        raise ValueError(message)


def read_hashes(path):
    lines = path.read_text().splitlines()
    timestamp = capture.event_time({'timestamp': lines[0]})
    rows = {}
    for line in lines[1:]:
        digest, filename = line.split('  ', 1)
        case = Path(filename).parent.name
        checked(case in CASES and case not in rows, 'Unexpected or duplicate fixture hash')
        checked(Path(filename).name == f'{case}-a831f905.md', 'Unexpected fixture name')
        rows[case] = digest
    checked(set(rows) == set(CASES), 'Expected all four fixture hashes')
    return timestamp, rows


def replay(directory, output):
    result = directory / 'result.json'
    source_log = directory / 'renderer.ndjson'
    fixture = directory / 'open-a831f905.md'
    checked((directory / 'stop').is_file(), 'Missing stop marker')
    report = json.loads(result.read_text())
    expected = {'case': 'sequence', 'fixture': fixture.name, 'extension': str(EXTENSION),
                'cdhash': CDHASH, 'imageUuid': IMAGE_UUID, 'executableSha256': EXECUTABLE_SHA,
                'scriptSha256': SCRIPT_SHA, 'suspension': None, 'correlated': False,
                'error': 'Expected start, completed once in order'}
    checked(all(report.get(k) == v for k, v in expected.items()), 'Capture metadata differs from expected candidate')
    checked(report['fixtureSha256'] == capture.sha256(fixture), 'Primary fixture bytes differ')
    checked({f'{EXTENSION}: valid on disk', f'{EXTENSION}: explicit requirement satisfied'}.issubset(report['staticSeal'].splitlines()), 'Missing captured static seal')
    identities = {int(pid): row for pid, row in report['identities'].items()}
    for pid, row in identities.items():
        required = {f'{pid}: dynamically valid', f'{pid}: explicit requirement satisfied'}
        checked(bool(row['birth']) and required.issubset(row['dynamicVerification'].splitlines()), 'Missing live process identity')
    events = [json.loads(line) for line in source_log.read_text().splitlines()]
    checked(bool(events), 'Empty grouped interval')
    times = [capture.event_time(event) for event in events]
    checked(times == sorted(times) and times[0] >= capture.event_time({'timestamp': report['readyUtc']}), 'Unordered or pre-capture events')
    groups = {}
    for event in events:
        parsed = capture.parse_event(event)
        checked(parsed is not None and parsed[1] in ('start', 'completed'), 'Unexpected renderer event')
        groups.setdefault(parsed[0], []).append(event)
    requests = [capture.summarize(group, EXECUTABLE, IMAGE_UUID, 'sequence', identities, None) for group in groups.values()]
    checked(set(identities) == {request['pid'] for request in requests}, 'Process identities and requests differ')
    before_time, before = read_hashes(directory / 'fixture-hashes-before.txt')
    after_time, after = read_hashes(directory / 'fixture-hashes-after.txt')
    manifest = {}
    for line in (directory / 'fixtures-original.sha256').read_text().splitlines():
        digest, filename = line.split('  ', 1)
        case = Path(filename).parent.name
        if case in CASES:
            checked(Path(filename).name == f'{case}-a831f905.md' and case not in manifest, 'Unexpected manifest fixture')
            manifest[case] = digest
    checked(before == after == manifest == EXPECTED_FIXTURES and before['open'] == report['fixtureSha256'], 'Fixture manifest mismatch')
    for case, digest in before.items():
        checked(capture.sha256(directory / f'{case}-a831f905.md') == digest, 'Retained fixture bytes differ')
    checked(before_time <= times[0] <= times[-1] <= after_time, 'Fixture snapshots do not bracket requests')
    summary = {'captureResultSha256': capture.sha256(result), 'captureLogSha256': capture.sha256(source_log),
               'fixtureHashes': before, 'fixtureHashesBeforeUtc': before_time.isoformat(), 'fixtureHashesAfterUtc': after_time.isoformat(),
               'processIds': sorted(identities), 'requestCount': len(requests), 'requests': requests,
               'scope': 'Grouped multi-fixture interval; requests cannot be assigned to individual files or displayed responses. Visual observations are separate.'}
    with output.open('x') as stream:
        json.dump(summary, stream, indent=2)
        stream.write('\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    replay(args.directory, args.output)
