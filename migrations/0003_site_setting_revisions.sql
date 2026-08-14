-- Optimistic concurrency and durable publication coordinates for Studio settings.
ALTER TABLE site_settings ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE site_settings ADD COLUMN draft_hash TEXT;
ALTER TABLE site_settings ADD COLUMN published_hash TEXT;
ALTER TABLE site_settings ADD COLUMN published_commit_sha TEXT;
ALTER TABLE site_settings ADD COLUMN published_at TEXT;
