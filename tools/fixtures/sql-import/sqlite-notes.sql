-- Offline note workspace. Stable text IDs are allocated by the client.
CREATE TABLE main.workspace (
    workspace_id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE TABLE "Note" (
    workspace_id TEXT NOT NULL,
    "Note ID" TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Untitled',
    body TEXT,
    PRIMARY KEY (workspace_id, "note id"),
    FOREIGN KEY (workspace_id) REFERENCES workspace (workspace_id) ON DELETE CASCADE
);
CREATE TABLE tag (
    workspace_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (workspace_id, tag_id),
    UNIQUE (workspace_id, label),
    FOREIGN KEY (workspace_id) REFERENCES workspace (workspace_id)
);
CREATE TABLE note_tag (
    workspace_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (workspace_id, note_id, tag_id),
    FOREIGN KEY (workspace_id, note_id) REFERENCES "NOTE" (workspace_id, "NOTE ID"),
    FOREIGN KEY (workspace_id, tag_id) REFERENCES tag (workspace_id, tag_id)
);
CREATE TABLE sync_checkpoint (
    workspace_id TEXT NOT NULL UNIQUE,
    last_sync TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspace (workspace_id)
);
