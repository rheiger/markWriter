# Package notice and source provenance

The verification follows the pinned npm tarball into a clean frontend build and then into each packaged executable. The candidate is an exact Git commit. The release packaging job supplies an installer or disk image, its source manifest and a notice sidecar for comparison.

## Reproduce

The verifier runs on Linux with Node 24.22.2, git, curl, tar, 7-Zip with NSIS/HFS+ support, and dpkg-deb. Start in a clean checkout of the candidate. Use a separate directory for the scripts and for downloaded artifacts.

```bash
source_checkout=$PWD
commit=$(git rev-parse HEAD)
run_id=45878938169
proof_dir=$(mktemp -d)
npm ci --prefix frontend
npm run build --prefix frontend
(cd frontend && ./node_modules/.bin/vite build --config vite.quicklook.config.ts --outDir "$proof_dir/quicklook")
gh run download "$run_id" -R rheiger/markWriter -p 'package-*' -D "$proof_dir/artifacts"
node /absolute/path/to/verify.mjs "$source_checkout" "$commit" "$run_id" \
  "$proof_dir/artifacts" "$proof_dir/quicklook/quicklook-render.js" > "$proof_dir/package-proof.json"
xvfb-run -a python3 /absolute/path/to/live-linux.py \
  "$proof_dir/artifacts/package-ubuntu-26.04-x64" "$commit" > "$proof_dir/live-linux.json"
```

The live Linux check additionally requires tauri-driver and WebKitWebDriver. It launches only the binary from the matched DEB, with a temporary profile in Xvfb. It reads the notice through the app's same-origin resource URL and hashes the returned bytes inside WebKit.

## Evidence chain

- Compare the registry version, tarball URL, SHA-512 and gitHead with the lockfile and pinned upstream commit. Compare the installed and tarball-extracted raw `plantuml.js` byte for byte. Verify the upstream TeaVM and JZlib release tag commits and source files.
- Fetch each pinned license or attribution file, compare the complete bytes and SHA-256 with the checked-in copy, and locate its full contents in the packaged notice. Preserve the source file URLs and hashes in the receipt. Check the compiled Smetana, TeaVM, JZlib and OpenPDF markers in the original engine, rebuilt application render worker and rebuilt Finder script.
- Verify package SHA-256, size, run ID, source revision and the installed-executable SHA-256 from the builder manifest. Extract the host directly from the DMG, NSIS installer or DEB and check its hash. Check the shipped plain-text notice sidecar against the source blob.
- Locate the Tauri resource keys and compressed streams inside the actual executable. Decompress each packaged stream and compare the entire output with the source notice or independently built worker. Record the compressed offsets, lengths and both compressed and decoded SHA-256 hashes. The short Brotli header prefix only locates candidate offsets. Compression changes may prevent locating a stream and cause an explicit failure.
- For the Mac package, compare the Finder extension's actual injected script with the independent Quick Look build. The Windows Explorer provider has a separate scope. The application validation worker operates on SVG and has its own hash.

The recorded checks establish release archive and resource identity. They trace the shipped engine through its published npm artifact and pinned source references. They do not claim a bit-for-bit independent recompilation of the Java sources through the upstream TeaVM toolchain. The package build manifests and the runnable synthetic tests capture the exact targets tested.
