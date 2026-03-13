-- 022_user_presence.sql
-- Adds last_seen_at to users table for real-time online/offline presence tracking.
-- Updated by authMiddleware on every authenticated request (non-blocking).

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);
