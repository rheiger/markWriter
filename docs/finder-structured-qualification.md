# Structured Finder preview qualification

Use an isolated Apple silicon macOS test account or VM. Stage the exact published
DMG after comparing its SHA-256 with the release's `SHA256SUMS`. Record the OS
version and build, architecture, DMG hash and the staged Quick Look executable
hash. Verify both the app and its embedded Quick Look extension with
`codesign --verify --deep --strict`. The published package uses ad-hoc seals.

Copy the [synthetic fixtures](../native/quicklook/tests/fixtures/structured/) to
a scratch directory. Use fresh filenames for repeat runs so Finder can request
new previews. Copy `partial.jsonl` to `partial.ndjson` to check the alternate
suffix. Generate the record-count fallback in the scratch directory.

```sh
{
    awk 'BEGIN {for (n = 1; n <= 2000; n++) print "{}"}'
    printf '%s' '{"final":"JSONL-LIMIT-FINAL"}'
} > line-limit.jsonl
```

Select each fixture in Finder and press Space. Record the preview's actual
content and colors in Light and Dark appearances. The expected observations
below apply when Finder chooses MarkWriter.

| Fixture | Expected visible preview |
| --- | --- |
| `compact.json` | Indented nested object, exact integer `9007199254740993` and `JSON-FINAL` with Unicode and literal punctuation. |
| `partial.jsonl`, `partial.ndjson` | Invalid second-record notice, literal malformed record and independently formatted third record with `JSONL-FINAL`. |
| `element.xml` | Element-only formatting notice, indentation and `XML-ELEMENT-FINAL`. |
| `mixed.xml` | Literal XML fallback, inline element, literal `&amp;` spelling and `XML-MIXED-FINAL`. |
| `multi-document.yaml` | Formatted block mappings and list, document separator, exact `0001` and `YAML-BLOCK-FINAL`. |
| `flow-anchor.yml` | Literal fallback notice and preserved flow collection, anchor, alias, document separators and `YAML-LITERAL-FINAL`. |
| `line-limit.jsonl` | 2,000-line limit notice and literal records. Scroll to the end to verify `JSONL-LIMIT-FINAL`. |

For enriched replies, correlate renderer completion events with each preview's
time and record the event's executable path. Keep the PlugInKit listing as
registration evidence. The extension does not emit an enrichment completion
for the plain JSON Lines limit reply.

```sh
/usr/bin/log stream --level info --style ndjson \
  --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"'
```

Compare the SHA-256, size and modification time of each synthetic file before
and after display. Compare the effective Open With application for each
suffix before registration, during coexistence and after cleanup. The
[registration probe](../tools/quicklook-registration-probe.swift) provides
separate type and default-editor evidence for representative files.

Repeat fresh YAML and JSON previews with a YAML-only competing provider
registered under a distinct bundle identifier. Record the selected provider
for each fixture even if priority differs across hosts. Exercise the competitor
on its own, then remove its registration and verify that MarkWriter serves a
fresh YAML fixture again. The competitor can be a test-only copy of the
package with separate host and extension identifiers, the extension restricted
to `public.yaml`, and host editor associations and type declarations removed.
Ad-hoc seal the copied extension and host after editing their metadata. Compare
provider executable paths rather than assuming priority from the bundle names
or the screenshots. Restore the isolated session's original appearance and
provider registration when finished.
