-- ParaHype Daily Tasks Migration
-- Run with: wrangler d1 execute parahype-db --remote --file=migration-daily-tasks.sql

-- Add recurrence to tasks
ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT NULL;
-- recurrence values: null (one-time), 'daily', 'weekdays', 'weekly'

-- Track daily resets so we know which recurring tasks have been reset today
CREATE TABLE IF NOT EXISTS daily_task_resets (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  steps_completed INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_task_resets ON daily_task_resets(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_task_resets_task ON daily_task_resets(task_id, date);
