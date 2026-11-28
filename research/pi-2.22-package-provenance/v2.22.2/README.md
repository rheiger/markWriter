# MarkWriter v2.22.2 package provenance

The tag resolves to `582eb7114b9bcbf4a3179492011ef0a5be976311`. GitHub Actions built the three packages on the tag push in [run 46133829847](https://github.com/rheiger/markWriter/actions/runs/46133829847).

- [Tagged downloads](tagged-downloads.json) records the artifact IDs, GitHub archive digests and inner package checksums. The download check validated the tag event, workflow path, full source commit, release version and package manifest.
- [Package proof](package-proof.json) records the pinned npm tarball, engine hash, upstream commits, eight original license and notice documents, and the bytes recovered from each packaged executable. It includes the hash of the Quick Look renderer extracted from the DMG.
- [Ubuntu package live notice](live-linux.json) records the response from the extracted DEB's executable under WebKitGTK in an isolated profile and Xvfb session on Debian.

The [verifier](../verify.mjs) compared a clean frontend and Quick Look rebuild from the tag with renderer and validation workers decoded from each binary, and with the renderer in the Quick Look extension. The source checkout used Node 24.22.2 and `npm ci`. Platform installation, seal verification and visual qualification have separate receipts.

To rerun, set `src` to a clean checkout of the tag, `proof` to the directory containing these receipts, and `work` to an empty absolute directory on a volume with room for dependencies and the three packages. The verifier uses Node, curl, Git, tar, 7z and dpkg-deb. The live notice check also uses WebKitWebDriver, tauri-driver and Xvfb.

```sh
set -eu
sha=582eb7114b9bcbf4a3179492011ef0a5be976311
run=46133829847
test "$(git -C "$src" rev-parse HEAD)" = "$sha"
test "$(git -C "$src" rev-parse 'v2.22.2^{commit}')" = "$sha"
mkdir -p "$work/tmp"
export TMPDIR="$work/tmp"
(cd "$src/frontend" && npm ci && npm run build &&
  ./node_modules/.bin/vite build --config vite.quicklook.config.ts --outDir "$work/finder")
gh run download "$run" -R rheiger/markWriter -p 'package-*' -D "$work/artifacts"
node "$proof/../verify.mjs" "$src" "$sha" "$run" "$work/artifacts" "$work/finder/quicklook-render.js" > "$work/package-proof.json"
xvfb-run -a python3 "$proof/../live-linux.py" "$work/artifacts/package-ubuntu-26.04-x64" "$sha" > "$work/live-linux.json"
```
