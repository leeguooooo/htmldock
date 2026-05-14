-- v0.5 follow-up: 0003 created the `legacy` team and backfilled existing
-- projects into it, but left team_members empty. Dashboards and listing
-- endpoints join team_members so they showed no data for users who
-- already existed before v0.5 shipped.
--
-- Add every pre-existing user to `legacy` as an admin. New users created
-- after this migration must explicitly create or join a team.

INSERT OR IGNORE INTO team_members (team_id, user_id, role, added_at)
SELECT
  (SELECT id FROM teams WHERE slug = 'legacy'),
  users.id,
  'admin',
  unixepoch()
FROM users
WHERE (SELECT id FROM teams WHERE slug = 'legacy') IS NOT NULL;
