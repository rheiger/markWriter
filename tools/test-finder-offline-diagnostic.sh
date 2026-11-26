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
# Retain only interface names/flags and route classes, not addresses or gateways.
inventory() {
  local phase=$1 family
  /sbin/ifconfig -a | /usr/bin/awk '/^[^[:space:]].*: flags=/ { sub(/ mtu.*/, ""); print }' > "$results/interfaces-$phase.txt"
  for family in inet inet6; do
    /usr/sbin/netstat -rn -f "$family" | /usr/bin/awk -v family="$family" '
      $1 == "Destination" { for (i=1; i<=NF; i++) if ($i == "Netif") col=i; next }
      !col || NF < col || $col ~ /^lo/ { next }
      family == "inet" && $1 ~ /^(127[.]|169[.]254[.]|22[4-9][.]|23[0-9][.]|255[.])/ { next }
      family == "inet6" && $1 ~ /^(::1|fe80|ff)/ { next }
      { print ($1 == "default" ? "default" : "nonlocal") " " $col }
      END { if (!col) exit 2 }
    ' | /usr/bin/sort -u > "$results/routes-$family-$phase.txt"
  done
}
inventory before
controls=(https://github.com/ https://api.github.com/)
for url in "${controls[@]}"; do /usr/bin/curl -fsS --connect-timeout 5 --max-time 10 "$url" -o /dev/null; done
printf 'online_before_controls=2\n' >> "$results/network.txt"
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
for url in "${controls[@]}"; do
  if /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 "$url" -o /dev/null; then
    echo 'Connectivity remained available while the interface was down' >&2; exit 1
  fi
done
printf 'offline_controls_failed_as_expected=2\n' >> "$results/network.txt"
inventory offline
[[ ! -s "$results/routes-inet-offline.txt" && ! -s "$results/routes-inet6-offline.txt" ]] || {
  echo 'Nonlocal route remains while the default interface is down' >&2; exit 1;
}
printf 'no_nonlocal_routes=true\n' >> "$results/network.txt"
MARKWRITER_FINDER_CASES=offline tools/test-finder-dbml-package.sh "$app" "$package" "$results/finder"
# Verify the watchdog or another service did not restore networking mid-test.
inventory offline-end
[[ ! -s "$results/routes-inet-offline-end.txt" && ! -s "$results/routes-inet6-offline-end.txt" ]] || { echo 'Nonlocal route returned during the Finder trial' >&2; exit 1; }
for url in "${controls[@]}"; do
  if /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 "$url" -o /dev/null; then
    echo 'Connectivity returned during the Finder trial' >&2; exit 1
  fi
done
printf 'offline_end_controls_failed_as_expected=2\n' >> "$results/network.txt"
/usr/bin/sudo -n /sbin/ifconfig "$interface" up
printf 'interface_restored=true\n' >> "$results/network.txt"
for ((attempt=0; attempt<20; attempt++)); do
  recovered=true
  for url in "${controls[@]}"; do
    if ! /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 "$url" -o /dev/null; then recovered=false; fi
  done
  if [[ "$recovered" == true ]]; then
    printf 'online_after_controls=2\n' >> "$results/network.txt"
    inventory after
    exit 0
  fi
  sleep 1
done
echo 'Connectivity did not recover before artifact upload' >&2
exit 1
