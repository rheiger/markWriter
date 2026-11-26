import json
import pathlib
import sys

if len(sys.argv) != 5:
    raise SystemExit('Usage: compare-manual-restoration.py BEFORE_JSON AFTER_JSON PROVIDER_AFTER EXPECTED_CANDIDATE_PATH')
before = json.loads(pathlib.Path(sys.argv[1]).read_text())
after = json.loads(pathlib.Path(sys.argv[2]).read_text())
provider = pathlib.Path(sys.argv[3]).read_text()
candidate = sys.argv[4]
failures = []
if set(before) != set(after):
    failures.append('Synthetic fixture sets differ')
for name in sorted(set(before) & set(after)):
    for field in ('contentType', 'defaultApplication', 'extensionTypes'):
        a, b = before[name].get(field), after[name].get(field)
        if field == 'extensionTypes' and isinstance(a, list) and isinstance(b, list):
            a, b = sorted(a), sorted(b)
        if a != b:
            failures.append(f'{name}: {field} changed: {a!r} -> {b!r}')
for expected in ('com.markwriter.app.quicklook(2.19.3)', '/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex', 'C86EFCFB-7093-4CD6-A488-2B2A832B7592', '(1 plug-in)'):
    if expected not in provider:
        failures.append(f'Original provider listing missing {expected}')
if candidate in provider or str(pathlib.Path(candidate).resolve()) in provider:
    failures.append('Candidate provider still listed')
if failures:
    raise SystemExit('\n'.join(failures))
print('Original provider listing and synthetic content types, extension types and defaults match the observed baseline.')
print('Actual Finder selection of the restored provider still requires a separate correlated observation.')
