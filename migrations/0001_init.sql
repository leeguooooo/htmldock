PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  host TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(host, owner, repo)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  lark_open_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_access_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  scopes TEXT NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  local_cb TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  source_path TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  visibility TEXT NOT NULL DEFAULT 'team'
    CHECK (visibility IN ('team', 'public-allowed', 'private-strict')),
  r2_key TEXT NOT NULL,
  owner_user_id INTEGER REFERENCES users(id),
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, path)
);

CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES docs(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  title,
  body_text,
  content=''
);

CREATE INDEX IF NOT EXISTS idx_docs_project_updated ON docs(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_owner_updated ON docs(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_doc ON shares(doc_id);
CREATE INDEX IF NOT EXISTS idx_tokens_hash ON personal_access_tokens(token_hash);
