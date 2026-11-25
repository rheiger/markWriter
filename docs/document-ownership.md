# Document ownership and local persistence


Canonical Markdown lives once in an ordered document collection, identified by stable ID. The active document is a derived selection. Revision/saved-content metadata belongs to each document. Editor sessions retain engine states, selection, mode and scroll per open document; closing disposes them. Inactive sessions must not render previews or handle active-document callbacks.

Save/Save As/export capture the document ID, source revision and destination before dialogs/I/O. Completion updates only that owner and acknowledges only captured content. Conflicting open destinations are rejected; per-document writes are serialized. Close and Quit use Save/Discard/Cancel and preserve buffers on cancellation, failure or newer edits.

Within the running desktop app, Tauri tracks the window and tab that own each
canonical path. Opening an owned path focuses its existing tab. Moving a tab
commits the source and destination recovery snapshots together, then transfers
the live editor state in memory. A move is unavailable while the source window
has a pending document operation or either editor is composing text.

Open local files are checked for outside changes one tab at a time, including inactive tabs, with 500 ms between checks. The checker compares exact UTF-8 bytes up to 1 MiB, detects unavailable paths separately and reports when the size limit prevents automatic checking. A warning preserves the existing buffer. Reload from Disk reads the latest available bytes, requires confirmation to discard edits, and starts new undo histories in that tab. Save a Copy creates a new file without replacing its destination or changing tab ownership.

Every save to an owned path compares the current disk bytes to the last saved baseline after staging the new file. The comparison also rechecks the file identity and metadata before atomic replacement. Saves through MarkWriter's own document queue are serialized. Local filesystem APIs do not provide a portable atomic compare-and-replace for an uncooperative external writer. An external write or rename between the last check and replacement can still race. Remote filesystems and cloud placeholders are outside this qualification.

Settings and workspace snapshots use separate versioned JSON schemas in native config/data directories, atomic replacement, validation/migration and visible recoverable errors. Corrupt originals are retained. Recovery snapshots are debounced local copies, never writes to original documents; disk-source comparison at restart detects conflicts. Explicit discard removes recovery ownership before closing. Both editor histories survive tab switches and successful moves between windows. A move transfers the histories in memory. A process restart restores document recovery data with fresh histories. Final unflushed keystrokes cannot be guaranteed after abrupt termination.

Keep settings authoritative in the store. Dialog drafts apply only through Apply; Reset changes the draft and Cancel commits nothing. No unimplemented preferences are exposed.
