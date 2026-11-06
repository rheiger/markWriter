# Document ownership and local persistence

6 November 2026 — productivity increment

Canonical Markdown lives once in an ordered document collection, identified by stable ID. The active document is a derived selection. Revision/saved-content metadata belongs to each document. Editor sessions retain engine states, selection, mode and scroll per open document; closing disposes them. Inactive sessions must not render previews or handle active-document callbacks.

Save/Save As/export capture the document ID, source revision and destination before dialogs/I/O. Completion updates only that owner and acknowledges only captured content. Conflicting open destinations are rejected; per-document writes are serialized. Close and Quit use Save/Discard/Cancel and preserve buffers on cancellation, failure or newer edits.

Settings and workspace snapshots use separate versioned JSON schemas in native config/data directories, atomic replacement, validation/migration and visible recoverable errors. Corrupt originals are retained. Recovery snapshots are debounced local copies, never writes to original documents; disk-source comparison at restart detects conflicts. Explicit discard removes recovery ownership before closing. Undo history survives tab switches, not process restarts. Final unflushed keystrokes cannot be guaranteed after abrupt termination.

Keep settings authoritative in the store. Dialog drafts apply only through Apply; Reset changes the draft and Cancel commits nothing. No unimplemented preferences are exposed.
