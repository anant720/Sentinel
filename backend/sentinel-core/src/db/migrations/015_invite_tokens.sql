-- 015_invite_tokens.sql
-- Creates the invite_tokens table for managing organization invitations

CREATE TABLE IF NOT EXISTS invite_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- An email can only have one active (unused) invite per organization
    CONSTRAINT unique_active_invite UNIQUE (email, organization_id, is_used)
);

-- Index for quickly finding expired tokens for cleanup
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires_at ON invite_tokens(expires_at);

-- Partial index for active tokens (where is_used is false)
CREATE INDEX IF NOT EXISTS idx_invite_tokens_active ON invite_tokens(email, organization_id) WHERE is_used = false;
