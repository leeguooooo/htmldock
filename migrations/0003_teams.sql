-- v0.5 schema additions: teams, team_members; projects gains team_id + slug.
-- This migration uses only safe ALTER TABLE ADD COLUMN + CREATE INDEX operations
-- so it runs cleanly against live D1 (which does not honor PRAGMA foreign_keys=OFF
-- during user migrations and therefore cannot tolerate the table-rename + INSERT
-- + DROP pattern used in earlier drafts).
--
-- DB-level NOT NULL for team_id is not enforced (ADD COLUMN cannot set NOT NULL
-- without a constant default); the worker layer requires team_slug on every
-- write path. CASCADE on project_id and doc_id is similarly not added here;
-- worker code already performs manual cascade in deleteProject/deleteDoc.

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

ALTER TABLE projects ADD COLUMN team_id INTEGER REFERENCES teams(id);
ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN created_by INTEGER REFERENCES users(id);

INSERT OR IGNORE INTO teams (slug, name, created_by, created_at)
VALUES ('legacy', 'Legacy', (SELECT id FROM users ORDER BY id LIMIT 1), unixepoch());

UPDATE projects
SET team_id = (SELECT id FROM teams WHERE slug = 'legacy'),
    slug   = repo
WHERE team_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_team_slug ON projects(team_id, slug);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
