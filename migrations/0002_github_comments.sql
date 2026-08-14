-- GitHub-authenticated article comments and profile metadata.
PRAGMA foreign_keys = OFF;

CREATE TABLE comments_next (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('zine', 'blog')),
  target_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  github_id INTEGER,
  avatar_url TEXT,
  author_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO comments_next (id, target_kind, target_id, author, body, status, created_at)
SELECT id, target_kind, target_id, author, body, status, created_at FROM comments;

DROP TABLE comments;
ALTER TABLE comments_next RENAME TO comments;
CREATE INDEX idx_comments_target_status ON comments(target_kind, target_id, status, created_at DESC);

PRAGMA foreign_keys = ON;
