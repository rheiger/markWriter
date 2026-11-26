#!/bin/bash
# Staged controller for a human-operated VNC trial. Do not run "start" until
# the operator is ready. It changes only the task candidate's registration and
# restores the observed original provider on exit or a lost session.
set -u
set -o pipefail

MWQ=/tmp/markwriter-pi222-finder.4JogPG
MW_APP="$MWQ/19bd836/MarkWriter.app"
MW_EXT="$MW_APP/Contents/PlugIns/MarkWriterQuickLook.appex"
MW_ORIGINAL=/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex
MW_LS=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
MW_DMG="$MWQ/MarkWriter-2.21.1-plantuml-finder-19bd836.dmg"
MW_EXEC=$(/bin/realpath "$MW_EXT/Contents/MacOS/QuickLookPrototype") || exit 1
MW_PY=/usr/bin/python3
MW_SOURCE="$MWQ/manual-source"

valid_session() {
  case "$1" in "$MWQ"/manual-live.*) [[ -d "$1" && ! -L "$1" ]] ;; *) return 1 ;; esac
}

verify_no_candidate_host() {
  local output=$1
  local -a statuses
  "$MW_LS" -dump 2> "$output.errors" | /usr/bin/grep -F 'markwriter-pi222-finder.4JogPG/19bd836' > "$output"
  statuses=("${PIPESTATUS[@]}")
  # grep status 1 means no candidate path appeared. Do not retain the full
  # LaunchServices dump, which could contain unrelated applications.
  [[ "${statuses[0]}" == 0 && "${statuses[1]}" == 1 ]]
}

preflight() {
  local dir=$1 actual
  mkdir -p "$dir" || return 1
  actual=$(/usr/bin/shasum -a 256 "$MW_DMG" | /usr/bin/awk '{print $1}')
  [[ "$actual" == 5d44084cd7563357c671259a11dad8e40747a1cac24feb4ee17fef26e45946d1 ]] || { echo 'DMG hash mismatch' >&2; return 1; }
  actual=$(/usr/bin/shasum -a 256 "$MW_EXT/Contents/Resources/quicklook-render.js" | /usr/bin/awk '{print $1}')
  [[ "$actual" == e1df0b12ba83249f00965f2251714b80fda9418a97f7646e6b5a1a43fc1fddd9 ]] || { echo 'Script hash mismatch' >&2; return 1; }
  actual=$(/usr/bin/shasum -a 256 "$MW_EXEC" | /usr/bin/awk '{print $1}')
  [[ "$actual" == 25771777a50b493a08862cd23b43afe1000e459a5c20a7a6f5d4b31e5ad2b761 ]] || { echo 'Executable hash mismatch' >&2; return 1; }
  /usr/bin/shasum -a 256 "$MW_DMG" "$MW_EXT/Contents/Resources/quicklook-render.js" "$MW_EXEC" > "$dir/package-hashes.txt" || return 1
  /usr/bin/codesign --verify --deep --strict --verbose=2 "$MW_APP" > "$dir/host-seal.txt" 2>&1 || return 1
  /usr/bin/codesign --verify --strict --verbose=2 "$MW_EXT" > "$dir/extension-seal.txt" 2>&1 || return 1
  /usr/bin/shasum -a 256 -c "$MWQ/manual-fixtures-before.sha256" > "$dir/fixture-hashes-before.txt" || return 1
  /usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook > "$dir/provider-before.txt" || return 1
  verify_no_candidate_host "$dir/launchservices-candidate-before.txt" || { echo 'Candidate host already registered or LaunchServices query failed' >&2; return 1; }
  "$MW_SOURCE/registration-probe" "$MWQ/manual-registration-fixtures" "$MW_APP" "$MWQ/manual-defaults-before.json" > "$dir/defaults-before.json" 2> "$dir/defaults-before-errors.txt" || return 1
  "$MW_PY" "$MW_SOURCE/compare-manual-restoration.py" "$MWQ/manual-defaults-before.json" "$dir/defaults-before.json" "$dir/provider-before.txt" "$MW_EXT" > "$dir/baseline-comparison.txt" || return 1
  echo "PREFLIGHT_OK $dir"
}

restore() {
  local dir=$1
  valid_session "$dir" || return 1
  [[ -f "$dir/restore-needed" ]] || return 0
  {
    /bin/date -u '+%Y-%m-%dT%H:%M:%SZ restoration started'
    /usr/bin/pluginkit -r "$MW_EXT" || true
    "$MW_LS" -u "$MW_APP" || true
    "$MW_LS" -f /Applications/MarkWriter.app || true
    /usr/bin/pluginkit -a "$MW_ORIGINAL" || true
    /usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook > "$dir/provider-after.txt" || return 1
    verify_no_candidate_host "$dir/launchservices-candidate-after.txt" || return 1
    /usr/bin/shasum -a 256 -c "$MWQ/manual-fixtures-before.sha256" > "$dir/fixture-hashes-after.txt" || return 1
    "$MW_SOURCE/registration-probe" "$MWQ/manual-registration-fixtures" "$MW_APP" "$MWQ/manual-defaults-before.json" > "$dir/defaults-after.json" 2> "$dir/defaults-after-errors.txt" || return 1
    "$MW_PY" "$MW_SOURCE/compare-manual-restoration.py" "$MWQ/manual-defaults-before.json" "$dir/defaults-after.json" "$dir/provider-after.txt" "$MW_EXT" > "$dir/restoration-comparison.txt" || return 1
    /bin/mv "$dir/restore-needed" "$dir/restore-verified" || return 1
    /bin/date -u '+%Y-%m-%dT%H:%M:%SZ restoration verified'
  } >> "$dir/restore.log" 2>&1
}

watch() {
  local dir=$1 owner=$2 start now command attempts owner_started current_started
  valid_session "$dir" || exit 1
  start=$(/bin/date +%s)
  owner_started=$(/bin/ps -p "$owner" -o lstart= 2>/dev/null || true)
  while [[ ! -f "$dir/restore-verified" ]]; do
    now=$(/bin/date +%s)
    command=$(/bin/ps -p "$owner" -o command= 2>/dev/null || true)
    current_started=$(/bin/ps -p "$owner" -o lstart= 2>/dev/null || true)
    if ! kill -0 "$owner" 2>/dev/null || [[ -z "$owner_started" || "$current_started" != "$owner_started" || "$command" != *"$MW_SOURCE/manual-finder-session.sh"* ]] || (( now - start >= 1800 )); then
      if [[ -n "$owner_started" && "$current_started" == "$owner_started" && "$command" == *"$MW_SOURCE/manual-finder-session.sh"* ]] && (( now - start >= 1800 )); then kill -TERM "$owner" 2>/dev/null || true; fi
      if [[ ! -f "$dir/restore-needed" ]]; then
        echo 'NO_REGISTRATION_CHANGE' >> "$dir/watchdog.log"
        exit 0
      fi
      # Allow an active EXIT trap to finish before retrying restoration.
      for ((attempts=0; attempts<20; attempts++)); do [[ -f "$dir/restore-verified" ]] && exit 0; sleep 1; done
      for ((attempts=0; attempts<5; attempts++)); do
        [[ -f "$dir/restore-verified" ]] && exit 0
        restore "$dir" && [[ -f "$dir/restore-verified" ]] && exit 0
        sleep 2
      done
      echo 'RESTORATION_UNPROVEN: inspect restore.log and restore manually' >> "$dir/watchdog.log"
      exit 1
    fi
    sleep 1
  done
}

case "${1:-}" in
  preflight)
    dir=$(/usr/bin/mktemp -d "$MWQ/manual-preflight.XXXXXX") || exit 1
    preflight "$dir" || exit 1
    exit 0
    ;;
  --watch)
    [[ $# == 3 && "$3" =~ ^[0-9]+$ ]] || exit 2
    watch "$2" "$3"
    exit $?
    ;;
  start)
    echo 'Disabled: the observed restore changed the provider UUID; review and repair restoration before reuse.' >&2
    exit 2
    ;;
  *) echo 'Usage: manual-finder-session.sh preflight|start' >&2; exit 2 ;;
esac

dir=$(/usr/bin/mktemp -d "$MWQ/manual-live.XXXXXX") || exit 1
preflight "$dir" || exit 1
log_pid=
delay_pid=
active=
cleanup() {
  trap - EXIT HUP INT TERM
  if [[ -n "$delay_pid" ]]; then wait "$delay_pid" 2>/dev/null || true; fi
  if [[ -n "$log_pid" ]]; then kill "$log_pid" 2>/dev/null || true; wait "$log_pid" 2>/dev/null || true; fi
  if [[ -f "$dir/restore-needed" ]]; then
    if restore "$dir"; then echo "RESTORATION_VERIFIED $dir"; else echo "RESTORATION_UNPROVEN $dir" >&2; fi
  elif [[ -f "$dir/restore-verified" ]]; then
    echo "RESTORATION_VERIFIED $dir"
  else
    echo "NO_REGISTRATION_CHANGE $dir"
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

/usr/bin/nohup /bin/bash "$MW_SOURCE/manual-finder-session.sh" --watch "$dir" "$$" > "$dir/watchdog.log" 2>&1 < /dev/null &
watch_pid=$!
sleep 1
kill -0 "$watch_pid" 2>/dev/null || { echo 'Unable to start restoration watchdog' >&2; exit 1; }
: > "$dir/restore-needed"
"$MW_LS" -f "$MW_APP" > "$dir/registration.log" 2>&1 || exit 1
/usr/bin/pluginkit -a "$MW_EXT" >> "$dir/registration.log" 2>&1 || exit 1
/usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook > "$dir/provider-during.txt" || exit 1
if ! /usr/bin/grep -F "$MW_EXT" "$dir/provider-during.txt" >/dev/null && ! /usr/bin/grep -F "$(/bin/realpath "$MW_EXT")" "$dir/provider-during.txt" >/dev/null; then
  echo "CANDIDATE_NOT_LISTED $dir" >&2
  exit 1
fi
echo "READY $dir"
echo 'Commands: case-start NAME; timeout-arm; case-stop; note TEXT; stop'

while IFS= read -r line; do
  action=${line%% *}
  argument=${line#* }
  [[ "$line" == "$action" ]] && argument=
  case "$action" in
    case-start)
      case "$argument" in sequence|class|rejected|oversized|timeout|recovery) ;; *) echo 'INVALID_CASE'; continue ;; esac
      [[ -z "$active" && ! -e "$dir/$argument.ndjson" ]] || { echo 'CASE_ALREADY_ACTIVE_OR_EXISTS'; continue; }
      active=$argument
      /bin/date -u '+%Y-%m-%dT%H:%M:%SZ' > "$dir/$active-start.txt"
      /usr/bin/log stream --level info --style ndjson --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"' > "$dir/$active.ndjson" 2> "$dir/$active-log-error.txt" &
      log_pid=$!
      sleep 1
      if kill -0 "$log_pid" 2>/dev/null; then echo "ARMED $active"; else echo "LOG_FAILED $active"; log_pid=; active=; fi
      ;;
    timeout-arm)
      [[ "$active" == timeout && -n "$log_pid" && -z "$delay_pid" ]] || { echo 'INVALID_TIMEOUT_STATE'; continue; }
      "$MW_PY" "$MW_SOURCE/finder-delay-probe.py" "$MW_EXEC" "$dir/timeout.ndjson" > "$dir/timeout-injection.txt" 2>&1 &
      delay_pid=$!
      echo 'TIMEOUT_WATCHER_ARMED'
      ;;
    case-stop)
      [[ -n "$active" && -n "$log_pid" ]] || { echo 'NO_ACTIVE_CASE'; continue; }
      if [[ -n "$delay_pid" ]]; then
        if wait "$delay_pid"; then echo 'TIMEOUT_WATCHER_COMPLETED'; else echo 'TIMEOUT_WATCHER_FAILED'; fi
        delay_pid=
      fi
      sleep 1
      kill "$log_pid" 2>/dev/null || true
      wait "$log_pid" 2>/dev/null || true
      log_pid=
      /bin/date -u '+%Y-%m-%dT%H:%M:%SZ' > "$dir/$active-end.txt"
      if { if [[ "$active" == timeout ]]; then
        "$MW_PY" "$MW_SOURCE/summarize-manual-finder.py" "$dir/$active.ndjson" "$MW_EXEC" --require-timeout
      else
        "$MW_PY" "$MW_SOURCE/summarize-manual-finder.py" "$dir/$active.ndjson" "$MW_EXEC"
      fi; } > "$dir/$active-summary.json" 2> "$dir/$active-summary-error.txt"; then
        echo "CORRELATED $active $(cat "$dir/$active-summary.json")"
      else
        echo "INCONCLUSIVE $active $(cat "$dir/$active-summary-error.txt")"
      fi
      active=
      ;;
    note)
      [[ -n "$argument" ]] && printf '%s %s\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')" "$argument" >> "$dir/operator-notes.txt"
      echo 'NOTE_RECORDED'
      ;;
    stop) exit 0 ;;
    *) echo 'UNKNOWN_COMMAND' ;;
  esac
done
