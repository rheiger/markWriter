# Package notice and source provenance

The verification follows the pinned npm tarball into a clean frontend build and then into each packaged executable. The candidate is an exact Git commit. The release packaging job supplies an installer or disk image, its source manifest and a notice sidecar for comparison.

## Corrected candidate result

**Passed on the three exact packages.** The [packaging workflow](https://github.com/rheiger/markWriter/actions/runs/45878938169) built commit `ce882d781441c8376f69f52da5b27bf3f3a5f83e`. The producer used research metadata 2.21.1. All three downloaded sidecars and all three independently extracted host executables contained the 5,084,463-byte notice with SHA-256 `2078cf4c5242dcf56eb16b9eef81a207513e7e09ff34272ea11f2dbcfd282089`.

| Package | Bytes | SHA-256 | Decoded notice at host file offset |
| --- | ---: | --- | ---: |
| macos-arm64 | 15,171,482 | `e47013681a00f2ed08b3e36f37fdbab37fc0475175d60618f90a1c516e92b88d` | 12,838,633 |
| windows-x64 | 8,073,981 | `d4b44dd5c8912a94eaa35be646a0d3246cfcf8767f33d7c7190b525e0c84bc6f` | 11,764,505 |
| ubuntu-26.04-x64 | 10,130,394 | `9d4883830c9690ae0e541d4ff03c48eeac2344a4d6d31aa80badb3b1aae61344` | 5,944,045 |

Each package contained the exact 2,965,743-byte render worker and 106,602-byte validation worker from the independent lockfile build. The Finder script extracted from the macOS DMG matched the independently built 9,830,059-byte script. The actual Linux application returned its full same-origin notice as HTTP 200 text/plain under WebKitGTK. The Linux synthetic test used the extracted DEB on Debian and a fresh profile under Xvfb. [Decoded package receipts and upstream hashes](package-proof.json) · [Live notice response](live-linux.json)

The npm tarball matched its pinned SHA-512 integrity and SHA-256 `00e3d2849d443dd77d6ca9bdf8aedc63bd26ff86025972b617cb96f4678655ca`. Its raw engine matched the independently installed 3,238,458-byte engine with SHA-256 `c6664799aaa464319b5e1070a69850b93a7ea23ee41a23e920a8f2086e7da21c`. The eight complete attributed texts carried their pinned URLs and hashes. The source chain includes PlantUML/Smetana, TeaVM 0.16.0, JZlib 1.1.3 with zlib credits, and OpenPDF. The receipt lists the implementation references and compiled markers. [Pinned source mapping and distribution information](https://github.com/rheiger/markWriter/blob/ce882d781441c8376f69f52da5b27bf3f3a5f83e/notices/PlantUML-1.2026.10-provenance.txt)

As a control, the preceding package run was rejected when supplied to the verifier with the corrected commit and run ID. The macOS archive was ad-hoc signed in the producer workflow. Windows and Ubuntu were unsigned.

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
