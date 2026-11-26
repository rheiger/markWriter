#!/usr/bin/env bash
# Disposable hosted VM only. This temporarily disables interfaces with non-loopback routes.
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
      { print ($1 == "default" ? "default" : "nonlocal") " " $col }
      END { if (!col) exit 2 }
    ' | /usr/bin/sort -u > "$results/routes-$family-$phase.txt"
  done
}
# A stale route through a DOWN interface is recorded but cannot use an UP path.
# Refuse if any routed interface is active or cannot be inspected.
verify_routes_down() {
  local phase=$1 device flags
  while IFS= read -r device; do
    [[ -n "$device" ]] || continue
    flags=$(/sbin/ifconfig "$device" | /usr/bin/awk 'NR == 1 { sub(/ mtu.*/, ""); print }') || return 1
    [[ -n "$flags" ]] || return 1
    printf '%s\n' "$flags" >> "$results/routed-interface-flags-$phase.txt"
    printf '%s\n' "$flags" | /usr/bin/awk 'NR == 1 {
      if ($0 !~ /flags=[^<]*<[^>]*>/) exit 2
      if ($0 ~ /<([^>]*,)?UP(,|>)/) exit 1
    }' || return 1
  done < <(cat "$results/routes-inet-$phase.txt" "$results/routes-inet6-$phase.txt" | /usr/bin/awk '{print $2}' | /usr/bin/sort -u)
}
inventory before
controls=(https://github.com/ https://raw.githubusercontent.com/rheiger/markWriter/main/README.md)
for url in "${controls[@]}"; do /usr/bin/curl -fsS --connect-timeout 5 --max-time 10 "$url" -o /dev/null; done
printf 'online_before_controls=2\n' >> "$results/network.txt"
# Only operate on known, originally-UP route interfaces in this disposable VM.
devices=()
while IFS= read -r device; do
  [[ "$device" =~ ^(en|utun)[0-9]+$ ]] || { echo "Unexpected routed interface: $device" >&2; exit 1; }
  /sbin/ifconfig "$device" | /usr/bin/awk 'NR==1 { if ($0 ~ /<([^>]*,)?UP(,|>)/) exit 0; exit 1 }'
  devices+=("$device")
done < <(cat "$results/routes-inet-before.txt" "$results/routes-inet6-before.txt" | /usr/bin/awk '{print $2}' | /usr/bin/sort -u)
[[ ${#devices[@]} -gt 0 ]] || { echo 'No routed interfaces found' >&2; exit 1; }
printf 'interfaces_to_disable=%s\n' "${devices[*]}" >> "$results/network.txt"
# Restore all originally-UP interfaces on error and from a separate watchdog.
watchdog=
restore_interfaces() {
  local device failed=0
  for device in "${devices[@]}"; do /usr/bin/sudo -n /sbin/ifconfig "$device" up || failed=1; done
  return "$failed"
}
restore() {
  if restore_interfaces; then printf 'exit_restore_commands_succeeded=true\n' >> "$results/network.txt"; else printf 'exit_restore_commands_succeeded=false\n' >> "$results/network.txt"; fi
  inventory exit-restored || true
  if [[ -n "$watchdog" ]]; then kill "$watchdog" 2>/dev/null || true; wait "$watchdog" 2>/dev/null || true; fi
}
trap restore EXIT INT TERM
(sleep 180; restore_interfaces) &
watchdog=$!
for device in "${devices[@]}"; do /usr/bin/sudo -n /sbin/ifconfig "$device" down; done
printf 'interfaces_disabled=true\n' >> "$results/network.txt"
for url in "${controls[@]}"; do
  if /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 "$url" -o /dev/null; then
    echo 'Connectivity remained available while the interface was down' >&2; exit 1
  fi
done
printf 'offline_controls_failed_as_expected=2\n' >> "$results/network.txt"
inventory offline
verify_routes_down offline || { echo 'A routed interface is UP or cannot be inspected' >&2; exit 1; }
printf 'all_routed_interfaces_down=true\n' >> "$results/network.txt"
MARKWRITER_FINDER_CASES=offline tools/test-finder-dbml-package.sh "$app" "$package" "$results/finder"
# Verify the watchdog or another service did not restore networking mid-test.
inventory offline-end
verify_routes_down offline-end || { echo 'A routed interface became UP or cannot be inspected during Finder trial' >&2; exit 1; }
printf 'all_routed_interfaces_down_at_end=true\n' >> "$results/network.txt"
for url in "${controls[@]}"; do
  if /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 "$url" -o /dev/null; then
    echo 'Connectivity returned during the Finder trial' >&2; exit 1
  fi
done
printf 'offline_end_controls_failed_as_expected=2\n' >> "$results/network.txt"
restore_interfaces
printf 'interfaces_restore_attempted=true\n' >> "$results/network.txt"
for ((attempt=0; attempt<20; attempt++)); do
  recovered=true
  for url in "${controls[@]}"; do
    if ! /usr/bin/curl -fsS --connect-timeout 3 --max-time 5 "$url" -o /dev/null; then recovered=false; fi
  done
  if [[ "$recovered" == true ]]; then
    printf 'online_after_controls=2\n' >> "$results/network.txt"
    inventory after
    cmp "$results/routes-inet-before.txt" "$results/routes-inet-after.txt"
    cmp "$results/routes-inet6-before.txt" "$results/routes-inet6-after.txt"
    for device in "${devices[@]}"; do
      /sbin/ifconfig "$device" | /usr/bin/awk 'NR==1 { if ($0 ~ /<([^>]*,)?UP(,|>)/) exit 0; exit 1 }'
    done
    printf 'route_inventory_and_up_flags_restored=true\n' >> "$results/network.txt"
    exit 0
  fi
  sleep 1
done
echo 'Connectivity did not recover before artifact upload' >&2
exit 1
