# Integrated PlantUML research package on Linux

The unsigned Ubuntu DEB from integrated commit `dc921c26388ca59a8ecb913bc6c6090f3d9d9bd3` passed the packaged editor and native HTML export trial on Debian 13.8 x86-64 with WebKitGTK 2.54.0. The hosted installation on Ubuntu 26.04.1 with WebKitGTK 2.52.6 passed the existing 49-case package suite. The PlantUML-specific trial used the executable extracted from that DEB. [Package job](https://github.com/rheiger/markWriter/actions/runs/45873114289/job/140093308061)

| Measurement | Observation |
| --- | --- |
| DEB size | 10,117,154 bytes |
| DEB SHA-256 | `11ae661daa554efcbfc9ad8f45d56aff86d4515709cf4e4a65c4e92b6abf846b` |
| Executable SHA-256 | `7474e79669c2b8bcb20a426dc4df3b4eab977e51ea85766bf99e180fffa8aa7e` |
| Fresh session to WYSIWYG diagrams | 5,183 ms, including driver session startup and worker response checks |
| Subsequent switch to Preview | 3,357 ms in the same process |
| Maximum sampled sum of RSS | 873,624 KiB across 48 samples, up to three processes |
| Saved HTML | 7,669 bytes, SHA-256 `79c35a52ecc342bfbcc2e37311fd42cb85907609c1bda3f5a1b6eb8da65e13d6` |

The observation began with a fresh application process and a synthetic document and profile. The host filesystem caches were uncontrolled. The 250 ms process-tree RSS sampler can count shared pages more than once and miss short peaks. These are individual measurements. The research package retains version metadata 2.21.1.

The synthetic sequence showed Alice and Bob, Request and Response, with two arrowheads. The class diagram showed User and Order, their integer fields, and the association labeled owns with endpoints 1 and *. The editor, Preview and exported document had identical nondecorative SVG text and shape attributes across the 20 measured elements in each diagram. The missing theme remained readable as source. The native File menu and GTK Save File dialog produced two inline SVGs, the fallback source and an ordinary link. The export contained zero script, image or external stylesheet elements. Source bytes matched before and after. Both native worker responses matched the manifest's asset hashes and restrictive CSP. The unprivileged network namespace exposed only loopback. [Raw receipt](package-result.json) · [Saved synthetic HTML](exported.html) · [Package provenance and hosted cases](provenance.json)

## Reproduction

Use the research evidence branch with the package harness from commit `e44618a`. Download the package artifact from run 45873114289, artifact ID 15144342097. The ZIP SHA-256 is `87195ea084a6a438f629dbdc7499408213169d6b45c768be656400c307511e74`. Check the bundled `ubuntu-26.04-x64.manifest.json` source, size and DEB SHA-256 against the values above. Extract the DEB into a fresh directory with `dpkg-deb -x`.

Use Node 24.22.2, tauri-driver 2.1.0, WebKitWebDriver, Xvfb, X11/XTest, xwininfo and Python 3. Generate worker assets with `npm ci --prefix frontend` and `npm run build --prefix frontend`. The two worker files read by the harness must match their corresponding entries in the package manifest. For this trial those files came from the integrated source build and were matched to the hosted manifest before launch.

From the evidence checkout, set `MARKWRITER_BINARY` to the absolute extracted executable and `MARKWRITER_EXPORT_EVIDENCE` to a new file in a private temporary directory. Export fresh `XDG_RUNTIME_DIR` (mode 0700), `XDG_CONFIG_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_HOME` paths inside the private directory. The harness creates its own synthetic fixture and profile. Then run on a Linux system permitting unprivileged network namespaces.

```sh
unshare -U --map-current-user --keep-caps -n bash -ceu '
  ip link set lo up
  test -z "$(ip route)"
  test -z "$(ip -6 route show default)"
  exec env GIO_USE_VFS=local GDK_BACKEND=x11 dbus-run-session -- \
    xvfb-run -a -s "-screen 0 1920x1080x24" node tools/plantuml-package-spike.mjs
'
```

The Xvfb WebKitGTK checks compare document geometry and the static export. Human Finder fidelity, macOS and Windows PlantUML behavior, and package publication require separate evidence.
