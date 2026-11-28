# MarkWriter v2.22.2 installed PlantUML qualification

The unsigned Ubuntu and Windows installers passed sequence, class and readable-source fallback checks in WYSIWYG, read-only Preview and native File → Export as HTML. Both workflows downloaded the packages from build 46133829847 and verified the GitHub artifact SHA-256, manifest version, tag and commit, installer size and SHA-256, installed version and executable SHA-256. The tested source was `582eb7114b9bcbf4a3179492011ef0a5be976311`, tag `v2.22.2`. The test harness revision was `3314e3660361dadaabb26d6119360239e811d43a`. [Producer](https://github.com/rheiger/markWriter/actions/runs/46133829847) · [Qualification request](../../../research/pi-2.22-release/request.json)

| Installed package | Package bytes | Package SHA-256 | Executable SHA-256 |
| --- | ---: | --- | --- |
| Ubuntu 26.04 x64 DEB | 10,128,644 | `f8516f7e496205bb8bd73aac83d548e18d644a7ba870a1d0abf9cd2e60580635` | `881a302ee2722b59bf7ff7c8aca77ca5b548374c9418b0b7f2a6ce5fa0c1b145` |
| Windows x64 NSIS | 8,078,000 | `6b7bd48a56e7211fd79082c5c418458db00e82936e0e189e8039df40f627fd91` | `3b2601f9d6d355c05e0692bd67c1bf92a65ce0c1f0af32d252127b249738ca36` |

Both installed WebViews served the pinned `@plantuml/core@1.2026.10` Smetana rendering worker and the SVG validation worker with the checked hashes and restrictive worker CSP. Each WebView also served the 5,084,463-byte `THIRD_PARTY_NOTICES.txt` with HTTP 200 and SHA-256 `2078cf4c5242dcf56eb16b9eef81a207513e7e09ff34272ea11f2dbcfd282089`, matching the tagged source. Independent parsing of both downloaded HTML files confirmed their recorded SHA-256, embedded diagram labels and source fallbacks, ordinary hyperlinks and absence of script, image, iframe, link, object, embed and remote CSS resource references. [Ubuntu responses](ubuntu/result.json) · [Windows responses](windows/pi222-windows.json)

## Ubuntu

On Ubuntu 26.04.1 LTS, WebKitGTK 2.52.6 ran the installed app under an ordinary account in an isolated profile and a loopback-only network namespace. The sequence included Alice, Bob, Request and Response. The class diagram included User, Order, integer fields, the owns relationship and 1 and * ends. WYSIWYG, Preview and the native GTK-saved HTML matched on all SVG shapes, attributes and text, with 20 measured elements per diagram. The missing-theme block and original Markdown retained their source. The 7,669-byte export had SHA-256 `79c35a52ecc342bfbcc2e37311fd42cb85907609c1bda3f5a1b6eb8da65e13d6`. [Ubuntu job](https://github.com/rheiger/markWriter/actions/runs/46135190241/job/140948789356) · [Package receipt](ubuntu/release-package-identity.json) · [Saved export](ubuntu/synthetic-export.html)

The fresh application session took 4,270 ms through WYSIWYG readiness, including the asset response checks. Switching to Preview took 1,218 ms. Thirty process-tree RSS samples observed up to 935,252 KiB across as many as nine processes. Filesystem caches were uncontrolled. Sampled RSS may count shared pages repeatedly and miss peaks.

## Windows

The NSIS installer reported NotSigned and installed product version 2.22.2 on Windows Server 2025 Datacenter build 26100. The application used WebView2 157.0.4341.60 at medium integrity in an isolated profile, with outbound firewall blocks scoped to the app and WebView. Sequence and class diagrams rendered in both editor views and native saved HTML. Missing-theme, malformed-class and valid fifth blocks retained their exact source. The synthetic document retained its original SHA-256. The 7,705-byte export had SHA-256 `874866a227df808b3af11feb451f5dd325552990b01c4cdedc835521dae031c7`. [Windows job](https://github.com/rheiger/markWriter/actions/runs/46135190341/job/140948789713) · [Package receipt](windows/release-package-identity.json) · [Installed version](windows/pi222-installed.json) · [Fixture](windows/pi222-plantuml.md) · [Preview screenshot](windows/pi222-preview.png) · [Saved export](windows/pi222-export.html)

Opening the synthetic document through the native Windows file dialog took 7,976 ms through WYSIWYG readiness. Switching to Preview took 1,330 ms. Native export through the Save dialog took 3,605 ms. One sample after Preview measured 471,465,984 working-set bytes across seven application and WebView processes. The Windows and Ubuntu timings cover different fixture and dialog paths.
