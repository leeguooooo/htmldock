PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

INSERT OR IGNORE INTO teams (slug, name, created_by, created_at)
VALUES ('legacy', 'Legacy', (SELECT id FROM users ORDER BY id LIMIT 1), unixepoch());

ALTER TABLE projects ADD COLUMN team_id INTEGER REFERENCES teams(id);
ALTER TABLE projects ADD COLUMN slug TEXT;

UPDATE projects
SET team_id = (SELECT id FROM teams WHERE slug = 'legacy'),
    slug = repo
WHERE team_id IS NULL;

ALTER TABLE projects RENAME TO projects_old;

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  slug TEXT NOT NULL,
  host TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  display_name TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE(team_id, slug),
  UNIQUE(host, owner, repo)
);

INSERT INTO projects (id, team_id, slug, host, owner, repo, display_name, created_at)
SELECT id, team_id, slug, host, owner, repo, display_name, created_at
FROM projects_old;

DROP TABLE projects_old;

ALTER TABLE docs RENAME TO docs_old;

CREATE TABLE docs (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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

INSERT INTO docs (id, project_id, source_path, path, title, visibility, r2_key, owner_user_id, size_bytes, sha256, created_at, updated_at)
SELECT id, project_id, source_path, path, title, visibility, r2_key, owner_user_id, size_bytes, sha256, created_at, updated_at
FROM docs_old;

DROP TABLE docs_old;

ALTER TABLE shares RENAME TO shares_old;

CREATE TABLE shares (
  token TEXT PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

INSERT INTO shares (token, doc_id, created_by, expires_at, revoked, created_at)
SELECT token, doc_id, created_by, expires_at, revoked, created_at
FROM shares_old;

DROP TABLE shares_old;

CREATE INDEX IF NOT EXISTS idx_projects_team_slug ON projects(team_id, slug);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_docs_project_updated ON docs(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_owner_updated ON docs(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_doc ON shares(doc_id);

PRAGMA foreign_keys = ON;
