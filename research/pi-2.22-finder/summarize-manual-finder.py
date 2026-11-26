import datetime
import json
import pathlib
import re
import sys

if len(sys.argv) not in (3, 4) or len(sys.argv) == 4 and sys.argv[3] != '--require-timeout':
    raise SystemExit('Usage: summarize-manual-finder.py LOG_NDJSON EXACT_EXTENSION_EXECUTABLE [--require-timeout]')

path = str(pathlib.Path(sys.argv[2]).resolve())
events = {}
timeouts = []
pattern = re.compile(r'^request=([0-9a-fA-F-]{36}) (start|completed|fallback)(?: elapsed_ms=(\d+))?$')
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if not line.startswith('{'):
        continue
    item = json.loads(line)
    if item.get('processImagePath') != path:
        continue
    message = item.get('eventMessage', '')
    if message == 'Fallback: renderer timed out':
        timeouts.append(item)
    match = pattern.fullmatch(message)
    if match:
        events.setdefault(match.group(1), []).append((item, match.group(2), match.group(3)))

if len(events) != 1:
    raise SystemExit(f'Expected exactly one request from {path}; observed {len(events)}')
request_id, records = next(iter(events.items()))
if len(records) != 2 or records[0][1] != 'start' or records[1][1] not in ('completed', 'fallback'):
    raise SystemExit('Expected one start followed by one completion or fallback')
start, end = records[0][0], records[1][0]
if not isinstance(start.get('processID'), int) or start['processID'] <= 0 or start['processID'] != end.get('processID'):
    raise SystemExit('Process identity did not match')
if records[0][2] is not None or records[1][2] is None:
    raise SystemExit('Invalid elapsed time fields')
parse = lambda value: datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
begin, finish = parse(start['timestamp']), parse(end['timestamp'])
if finish < begin:
    raise SystemExit('Out-of-order request events')
matched_timeouts = [event for event in timeouts if event.get('processID') == start['processID'] and begin <= parse(event['timestamp']) <= finish]
if len(sys.argv) == 4 and (records[1][1] != 'fallback' or len(matched_timeouts) != 1):
    raise SystemExit('Expected one same-process timeout event within a fallback request')
print(json.dumps({'executable': path, 'requestId': request_id, 'pid': start['processID'], 'started': start['timestamp'], 'ended': end['timestamp'], 'outcome': records[1][1], 'elapsedMs': int(records[1][2]), 'sameProcessTimeoutEvents': len(matched_timeouts), 'scope': 'One request from exact executable during operator-controlled Finder selection; the request ID does not encode the filename.'}, indent=2))
