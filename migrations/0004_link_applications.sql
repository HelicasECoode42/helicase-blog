-- Public friendship-link applications, reviewed from Studio.
CREATE TABLE IF NOT EXISTS link_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  contact TEXT NOT NULL,
  avatar_url TEXT,
  backlink_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_link_applications_status_created
ON link_applications(status, created_at ASC);
