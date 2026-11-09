# MarkWriter desktop icons

The editable master is [`assets/markwriter-icon.svg`](../../assets/markwriter-icon.svg): warm folded paper and a sculpted brass fountain-pen nib on a deep teal/indigo tile, joined by one flowing ink stroke. Large shapes carry the identity at small sizes; gradients and highlights add depth at larger sizes. The same master appears in About and generates the native desktop assets, without a third-party mark.

The tracked desktop output is generated using the project's pinned Tauri CLI 2.8.3:

```sh
node frontend/node_modules/@tauri-apps/cli/tauri.js icon assets/markwriter-icon.svg --output /tmp/markwriter-icons
```

Copy only `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.icns`, and `icon.ico` from that temporary output into this directory. Mobile/Store output is outside the current desktop targets.

The pinned CLI reproduces the PNG/ICO bytes and every ICNS layer payload. ICNS chunk order can vary between runs, so its container hash is not a regeneration guarantee. Keep the generated ICNS intact; package integrity compares against the exact committed asset bytes.

PNG files are square 8-bit RGBA at 32/64/128/256/512px. The ICO includes 32px first, then 16/24/48/64/256px; the ICNS includes macOS 1x/2x layers through 1024px. `bundle.icon` explicitly includes all seven files, so Tauri also uses the same identity for native windows.

`node --test tools/icon-integrity.test.mjs` verifies configured formats, dimensions and layer completeness. Production package collection additionally checks the installed macOS resource and valid bundle seal, Linux desktop-entry/installed icon bytes, and the Windows executable's native associated icon.

References: [Tauri app icons](https://v2.tauri.app/develop/icons/), [ad-hoc signing](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing). Ad-hoc signing seals the bundle; it does not establish an Apple Developer identity or notarization.
