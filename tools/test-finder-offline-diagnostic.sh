#!/usr/bin/env bash
# Disposable hosted VM only. This deliberately disconnects the default interface.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == macOS && "$(/usr/bin/id -un)" == runner ]] || exit 1
app=$1
package=$2
results=$3
mkdir -p "$results"
results=$(cd "$results" && pwd -P)
interface=$(/sbin/route -n get default | /usr/bin/awk '$1 == "interface:" { print $2; exit }')
[[ "$interface" =~ ^en[0-9]+$ ]] || { echo "Unexpected network interface: $interface" >&2; exit 1; }
printf 'default_interface=%s\n' "$interface" > "$results/network.txt"
/usr/bin/curl -fsS --connect-timeout 5 --max-time 10 https://github.com/ -o /dev/null
printf 'online_before=true\n' >> "$results/network.txt"
# Restore even if a test fails; a separate watchdog limits accidental downtime.
watchdog=
restore() {
  /usr/bin/sudo -n /sbin/ifconfig "$interface" up || true
  if [[ -n "$watchdog" ]]; then kill "$watchdog" 2>/dev/null || true; wait "$watchdog" 2>/dev/null || true; fi
}
trap restore EXIT INT TERM
(sleep 120; /usr/bin/sudo -n /sbin/ifconfig "$interface" up) &
watchdog=$!
/usr/bin/sudo -n /sbin/ifconfig "$interface" down
printf 'after_down=' >> "$results/network.txt"
/sbin/ifconfig "$interface" | head -1 >> "$results/network.txt"
if /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 https://github.com/ -o /dev/null; then
  echo 'Connectivity remained available while the interface was down' >&2; exit 1
fi
printf 'offline_control_failed_as_expected=true\n' >> "$results/network.txt"
MARKWRITER_FINDER_CASES=offline tools/test-finder-dbml-package.sh "$app" "$package" "$results/finder"
/usr/bin/sudo -n /sbin/ifconfig "$interface" up
printf 'interface_restored=true\n' >> "$results/network.txt"
for ((attempt=0; attempt<20; attempt++)); do
  if /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 https://github.com/ -o /dev/null; then
    printf 'online_after=true\n' >> "$results/network.txt"
    exit 0
  fi
  sleep 1
done
echo 'Connectivity did not recover before artifact upload' >&2
exit 1
