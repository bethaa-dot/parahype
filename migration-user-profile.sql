-- ParaHype User Profile Migration
-- Run with: wrangler d1 execute parahype-db --remote --file=migration-user-profile.sql

ALTER TABLE users ADD COLUMN dob TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN is_minor INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN parent_name TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN parent_email TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN parent_consent_at TEXT DEFAULT NULL;
