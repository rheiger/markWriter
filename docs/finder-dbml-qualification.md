# Finder DBML qualification

Qualify the exact candidate package on Apple silicon in an isolated test account. Record macOS version, architecture, release commit, package SHA-256 and bundled script byte size and SHA-256. Verify the app and extension separately with `codesign --verify --deep --strict --verbose=2`. Record that both signatures are ad hoc. Use synthetic files only.

Copy `native/quicklook/tests/fixtures/dbml/` to a scratch folder and record their SHA-256 hashes. Generate an oversized schema with a sentinel as follows:

```sh
python3 - <<'PY'
from pathlib import Path
Path('oversized.md').write_text('# Oversized\n\n```dbml\nTable t {\n id int [pk]\n}\n' + '// padding\n' * 900 + '// FINAL-SENTINEL\n```\n')
PY
```

For a cold start, close Finder previews and let the extension process exit; use a fresh fixture filename to avoid cached previews. Start the renderer log stream below, select the file in Finder and press Space. Record elapsed time to visible preview and correlate completion and executable path to the candidate extension. PlugInKit registration alone and the Open With button do not prove provider selection. Record the selected provider and retain log evidence.

The renderer logs a fresh `request=<UUID> start` for each distinct active render.
On normal completion it logs one `completed` or `fallback` event with the same
request ID and elapsed milliseconds. An unmatched start is incomplete evidence,
for example if the extension process is terminated. Match IDs as well as
executable paths; simultaneous previews can share a process. The identifier
contains no document path or content and does not identify the fixture. Correlate
the selected fixture and visible content separately; do not attribute concurrent
requests by timing alone.

```sh
/usr/bin/log stream --level info --style ndjson \
  --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"'
```

Check `representative.md`: both tables, all columns, PK, unique, nullability and the complete relationship and cardinality must appear. Expand Diagram source and compare its text. Check `multiple.md`: four diagrams render and the fifth is readable source; all diagram sources remain available. Check `fallback.md` and `oversized.md`: each fence remains readable through its final line without a partial schema. Record outcomes and timings, including a warm repeat on a fresh filename. Test timeout/failure fallback using a controlled isolated renderer probe if available; do not claim a timeout was tested merely because a schema is large.

For a Markdown file exceeding the separate 1 MiB native file-read limit, Finder
shows only an explicitly truncated, escaped source prefix of at most 64 KiB.
It does not render the partial fence. Confirm the notice and prefix using a
synthetic file larger than 1 MiB; open the original in an editor to read the
remainder. This is distinct from the smaller per-diagram fallback above, which
retains the whole fence when the document itself is within the native limit.

Repeat the cold representative and fallback cases with networking disabled for the isolated account or machine. Confirm the selected provider and record the offline setting and outcome. Compare fixture hashes after previews. Record input, output and script-size observations, test setup and limitations. Distinguish direct renderer automation, installed-package checks, and actual interactive Finder results; absence of one is not evidence for it. Restore the original network and provider setup after the trial.
