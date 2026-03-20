-- Add E2EE metadata to users table for gradual migration
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS e2ee_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS password_version VARCHAR(20) DEFAULT 'legacy';

-- Add index for filtering e2ee status if needed
CREATE INDEX IF NOT EXISTS idx_users_e2ee ON users(e2ee_enabled);
