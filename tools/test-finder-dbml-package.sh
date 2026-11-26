#!/usr/bin/env bash
# Finder observations for the exact ad-hoc sealed package extracted by install-package-macos.sh.
# This records evidence; a successful invocation alone is not Finder acceptance.
set -euo pipefail
# Refuse before starting Finder or taking screenshots outside a GitHub-hosted VM.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == macOS && "$(/usr/bin/id -un)" == runner ]] || {
  echo 'Finder automation is restricted to a disposable GitHub-hosted macOS runner.' >&2; exit 1;
}
app=$1
package=$2
results=$3
extension="$app/Contents/PlugIns/MarkWriterQuickLook.appex"
executable="$extension/Contents/MacOS/QuickLookPrototype"
script="$extension/Contents/Resources/quicklook-render.js"
mkdir -p "$results"
results=$(cd "$results" && pwd -P)
work=$(mktemp -d "${TMPDIR:-/tmp}/markwriter-finder-dbml.XXXXXX")
work=$(cd "$work" && pwd -P)
preview_created=false
cleanup() {
  if [[ -n "${log_pid:-}" ]]; then kill "$log_pid" 2>/dev/null || true; wait "$log_pid" 2>/dev/null || true; fi
  if [[ "$preview_created" == true ]]; then
    /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder"' -e 'if exists window "Quick Look" then key code 53' -e 'end tell' >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT
cp native/quicklook/tests/fixtures/dbml/{representative,multiple,fallback}.md "$work/"
{
  printf '# Oversized Finder DBML\n\n```dbml\nTable t {\n id int [pk]\n}\n'
  for ((i=0;i<900;i++)); do printf '// padding %04d\n' "$i"; done
  printf '// FINAL-SENTINEL\n```\n'
} > "$work/oversized.md"
# Deterministic distinct pseudo-random graphs include cycles and crossings.
/usr/bin/python3 - "$work/stress.md" <<'PYGRAPH'
import pathlib, sys
out = ['# Bounded random Finder DBML stress\n\n']
for diagram in range(4):
    out.append('```dbml\n')
    for table in range(40):
        out.append(f'Table t{table} {{\n id int [pk]\n')
        if diagram == 0:
            out.extend(f' {col} int\n' for col in 'abcdefghi')
        out.append('}\n')
    state = diagram + 1
    def rand():
        global state
        state ^= (state << 13) & 0xffffffff
        state ^= state >> 17
        state ^= (state << 5) & 0xffffffff
        state &= 0xffffffff
        return state
    seen = set()
    while len(seen) < 100:
        a, b = rand() % 40, rand() % 40
        if a != b and (a, b) not in seen:
            seen.add((a, b))
            out.append(f'Ref: t{a}.id > t{b}.id\n')
    out.append(f'// DIAGRAM-{diagram}-FINAL-STRESS-SENTINEL\n```\n\n')
pathlib.Path(sys.argv[1]).write_text(''.join(out))
PYGRAPH
# ASCII fixture: bytes equal UTF-16 code units. Bound each code block and aggregate.
/usr/bin/python3 - "$work/stress.md" > "$results/stress-limits.txt" <<'PYLIMITS'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
blocks = [part.split('\n```', 1)[0] for part in text.split('```dbml\n')[1:]]
sizes = [len(b.encode('utf-16-le')) // 2 for b in blocks]
print(f'block_utf16_units={sizes} aggregate_utf16_units={sum(sizes)}')
assert len(sizes) == 4 and all(n <= 8192 for n in sizes) and sum(sizes) <= 16384
PYLIMITS
cp "$work/stress.md" "$results/stress-fixture.md"
node --input-type=module - "$work/stress.md" > "$results/stress-parser.txt" <<'NODE'
import { readFileSync } from 'node:fs'
import { dbmlToDot } from './frontend/src/lib/dbml.ts'
const blocks = readFileSync(process.argv[2], 'utf8').split('```dbml\n').slice(1).map(x => x.split('\n```', 1)[0])
if (blocks.length !== 4) throw new Error('Expected four blocks')
for (const [index, block] of blocks.entries()) {
  const dot = dbmlToDot(block)
  const tables = (dot.match(/\[shape=box label=/g) || []).length
  const refs = (dot.match(/ -> /g) || []).length
  const columns = (block.match(/ int(?: \[pk\])?$/gm) || []).length
  if (tables !== 40 || refs !== 100 || columns !== (index === 0 ? 400 : 40)) throw new Error(`Unexpected parser output for block ${index}`)
  console.log(`block=${index} tables=${tables} columns=${columns} refs=${refs} dot_bytes=${Buffer.byteLength(dot)}`)
}
NODE
/usr/bin/sw_vers > "$results/system.txt"
/usr/bin/uname -m >> "$results/system.txt"
/usr/bin/shasum -a 256 "$package" "$executable" "$script" > "$results/package-hashes.txt"
/usr/bin/wc -c "$script" > "$results/script-size.txt"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$app" > "$results/host-seal.txt" 2>&1
/usr/bin/codesign --verify --deep --strict --verbose=2 "$extension" > "$results/extension-seal.txt" 2>&1
/usr/bin/shasum -a 256 "$work"/*.md > "$results/fixtures-before.txt"
/usr/bin/xcrun swiftc tools/finder-capture-text.swift -o "$work/ocr"
/usr/bin/xcrun swiftc tools/finder-capture-accessibility.swift -o "$work/accessibility"
/usr/bin/xcrun swiftc tools/finder-window-id.swift -o "$work/window-id"
/usr/bin/xcrun swiftc tools/finder-scroll.swift -o "$work/scroll"
/usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook > "$results/registration.txt" 2>&1 || true
# Record the process state before the first request; do not claim cold start if present.
/bin/ps -axo pid=,command= | /usr/bin/awk -v executable="$executable" 'index($0, executable) && $0 !~ /awk/' > "$results/process-before.txt"
case "${MARKWRITER_FINDER_CASES:-all}" in
  all) cases=(representative multiple fallback oversized) ;;
  offline) cases=(representative fallback) ;;
  stress) cases=(stress) ;;
  delay)
    cp "$work/representative.md" "$work/timeout.md"
    /usr/bin/python3 - "$work/timeout.md" <<'PYDELAY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text().replace('```dbml\n', '```dbml\n// TIMEOUT FIXTURE SOURCE MARKER\n', 1)
json_rows = ',\n'.join(map(str, range(55000)))
p.write_text(s + '\n```json\n[\n' + json_rows + '\n]\n```\n')
PYDELAY
    cp "$work/timeout.md" "$results/timeout-fixture.md"
    /usr/bin/shasum -a 256 "$work"/*.md > "$results/fixtures-before.txt"
    cases=(timeout representative)
    ;;
  *) echo 'Unknown Finder fixture set' >&2; exit 1 ;;
esac
for name in "${cases[@]}"; do
  # An existing window could otherwise be mistaken for the new preview.
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder"' -e 'if exists window "Quick Look" then key code 53' -e 'end tell'
  sleep 1
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder"' -e 'if exists window "Quick Look" then error "Quick Look did not close"' -e 'end tell'
  fixture="$work/$name.md"
  /usr/bin/log stream --level info --style ndjson --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"' > "$results/$name-renderer.ndjson" 2> "$results/$name-renderer-error.txt" &
  log_pid=$!
  sleep 1
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$results/$name-start.txt"
  /usr/bin/osascript - "$fixture" <<'APPLESCRIPT'
on run argv
  set fixtureAlias to (POSIX file (item 1 of argv)) as alias
  tell application "Finder"
    activate
    reveal fixtureAlias
  end tell
end run
APPLESCRIPT
  selected=$(/usr/bin/osascript -e 'tell application "Finder" to POSIX path of (selection as alias)')
  [[ "$selected" -ef "$fixture" ]] || { echo "Finder selected unexpected fixture: $selected" >&2; exit 1; }
  preview_created=true
  if [[ "$name" == timeout ]]; then
    /usr/bin/python3 tools/finder-delay-probe.py "$executable" "$results/$name-renderer.ndjson" > "$results/$name-injection.txt" 2>&1 &
    hold_pid=$!
  fi
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder"' -e 'set frontmost to true' -e 'key code 49' -e 'end tell'
  # The native renderer has an eight-second deadline. Capture after it, allowing
  # time for the final Finder view to update; elapsed here is not render time.
  if [[ "$name" == timeout ]]; then
    wait "$hold_pid"
    sleep 0.45
  else
    sleep 10
  fi
  date -u '+%Y-%m-%dT%H:%M:%SZ' > "$results/$name-capture.txt"
  /bin/ps -axo pid=,command= | /usr/bin/awk -v executable="$executable" 'index($0, executable) && $0 !~ /awk/' > "$results/$name-processes.txt"
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder" to get name of every window' > "$results/$name-windows.txt"
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder"' -e 'if not (exists window "Quick Look") then error "Quick Look did not open"' -e 'end tell'
  selected=$(/usr/bin/osascript -e 'tell application "Finder" to POSIX path of (selection as alias)')
  [[ "$selected" -ef "$fixture" ]] || { echo "Finder selection changed before capture" >&2; exit 1; }
  "$work/accessibility" > "$results/$name-accessibility.json"
  window_id=$("$work/window-id" "$name.md")
  /usr/sbin/screencapture -x -l "$window_id" "$results/$name.png"
  "$work/ocr" "$results/$name.png" > "$results/$name-ocr.txt"
  # The preview's visible title must name the fresh fixture, not a stale window.
  /usr/bin/grep -Fiq "$name.md" "$results/$name-ocr.txt" || { echo "Preview title not identified by OCR: $name" >&2; exit 1; }
  if [[ "$name" == multiple || "$name" == oversized || "$name" == representative || "$name" == stress ]]; then
    direction=vertical
    [[ "$name" == representative ]] && direction=horizontal
    "$work/scroll" "$direction"
    sleep 1
    /usr/sbin/screencapture -x -l "$window_id" "$results/$name-scrolled.png"
    "$work/ocr" "$results/$name-scrolled.png" > "$results/$name-scrolled-ocr.txt"
    if [[ "$name" == oversized ]]; then
      /usr/bin/grep -Fiq 'FINAL-SENTINEL' "$results/$name-scrolled-ocr.txt" || { echo 'Oversized source sentinel not visible' >&2; exit 1; }
    fi
  fi
  if [[ "$name" == fallback ]]; then
    /usr/bin/grep -Fiq 'missing.id' "$results/$name-ocr.txt" || { echo 'Invalid reference source not visible' >&2; exit 1; }
  fi
  /usr/bin/osascript -e 'tell application "System Events" to tell process "Finder" to key code 53'
  preview_created=false
  kill "$log_pid" 2>/dev/null || true
  wait "$log_pid" 2>/dev/null || true
  log_pid=
  if [[ "$name" == timeout ]]; then
    /usr/bin/grep -F 'Fallback: renderer timed out' "$results/$name-renderer.ndjson" >/dev/null
    /usr/bin/grep -Fi 'Basic Markdown preview' "$results/$name-ocr.txt"
    /usr/bin/grep -Fi 'TIMEOUT FIXTURE SOURCE MARKER' "$results/$name-ocr.txt"
  else
    node tools/summarize-finder-logs.mjs "$results/$name-renderer.ndjson" "$executable" > "$results/$name-renderer-summary.json"
  fi
done
/usr/bin/shasum -a 256 "$work"/*.md > "$results/fixtures-after.txt"
cmp "$results/fixtures-before.txt" "$results/fixtures-after.txt"
cat > "$results/README.txt" <<'TEXT'
Raw Finder observations on a disposable hosted runner, not a pass receipt.
Review screenshots, OCR, accessibility tree and renderer log process paths against the extracted app.
Renderer summaries pair one request ID from the exact extension during a controlled selection interval; the ID does not encode a filename. Screenshots after 10 seconds do not establish time to visible preview or visual completeness.
No controlled network-off, document access attempt or forced timeout test is performed here.
The process-before receipt indicates whether the first extension process was absent. Those acceptance conditions require separate evidence.
TEXT
