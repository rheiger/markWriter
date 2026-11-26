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

```sh
/usr/bin/log stream --level info --style ndjson \
  --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"'
```

Check `representative.md`: both tables, all columns, PK, unique, nullability and the complete relationship and cardinality must appear. Expand Diagram source and compare its text. Check `multiple.md`: four diagrams render and the fifth is readable source; all diagram sources remain available. Check `fallback.md` and `oversized.md`: each fence remains readable through its final line without a partial schema. Record outcomes and timings, including a warm repeat on a fresh filename. Test timeout/failure fallback using a controlled isolated renderer probe if available; do not claim a timeout was tested merely because a schema is large.

Repeat the cold representative and fallback cases with networking disabled for the isolated account or machine. Confirm the selected provider and record the offline setting and outcome. Compare fixture hashes after previews. Record input, output and script-size observations, test setup and limitations. Distinguish direct renderer automation, installed-package checks, and actual interactive Finder results; absence of one is not evidence for it. Restore the original network and provider setup after the trial.
