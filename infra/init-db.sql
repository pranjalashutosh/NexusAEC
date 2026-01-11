-- Initialize Nexus AEC Database
-- This script runs automatically when PostgreSQL container starts for the first time

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- Documents Table (Vector Store for Knowledge Base)
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    embedding vector(1536), -- OpenAI ada-002 embedding dimension
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('ASSET', 'SAFETY_MANUAL', 'PROCEDURE')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for filtering by source type
CREATE INDEX IF NOT EXISTS documents_source_type_idx ON documents (source_type);

-- Index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS documents_metadata_idx ON documents USING GIN (metadata);

-- =============================================================================
-- Assets Table (Structured asset data)
-- =============================================================================
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id VARCHAR(100) UNIQUE NOT NULL, -- e.g., "P-104"
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    location VARCHAR(255),
    criticality VARCHAR(20) CHECK (criticality IN ('high', 'medium', 'low')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for asset lookups
CREATE INDEX IF NOT EXISTS assets_asset_id_idx ON assets (asset_id);
CREATE INDEX IF NOT EXISTS assets_category_idx ON assets (category);
CREATE INDEX IF NOT EXISTS assets_location_idx ON assets (location);

-- =============================================================================
-- User Preferences Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) UNIQUE NOT NULL,
    vips JSONB DEFAULT '[]',
    topics JSONB DEFAULT '[]',
    red_flag_keywords JSONB DEFAULT '[]',
    muted_senders JSONB DEFAULT '[]',
    verbosity VARCHAR(20) DEFAULT 'standard' CHECK (verbosity IN ('concise', 'standard', 'verbose')),
    language_variant VARCHAR(10) DEFAULT 'en-US',
    quiet_mode_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences (user_id);

-- =============================================================================
-- Audit Trail Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target JSONB DEFAULT '{}',
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'failed', 'undone')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    undone_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audit_entries_session_idx ON audit_entries (session_id);
CREATE INDEX IF NOT EXISTS audit_entries_user_idx ON audit_entries (user_id);
CREATE INDEX IF NOT EXISTS audit_entries_created_idx ON audit_entries (created_at);

-- =============================================================================
-- Drafts Table (Draft references for "Drafts Pending Review")
-- =============================================================================
CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    provider_draft_id VARCHAR(255) NOT NULL, -- ID in Gmail/Outlook
    source VARCHAR(20) NOT NULL CHECK (source IN ('OUTLOOK', 'GMAIL')),
    thread_id VARCHAR(255),
    subject TEXT,
    recipients JSONB DEFAULT '[]',
    is_pending_review BOOLEAN DEFAULT true,
    red_flag_rationale TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS drafts_user_idx ON drafts (user_id);
CREATE INDEX IF NOT EXISTS drafts_pending_idx ON drafts (is_pending_review) WHERE is_pending_review = true;

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables with updated_at
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drafts_updated_at BEFORE UPDATE ON drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Seed Data (Sample assets for development)
-- =============================================================================
INSERT INTO assets (asset_id, name, description, category, location, criticality) VALUES
    ('P-104', 'Pump Station 104', 'Main water distribution pump for Riverside district', 'Pump', 'Riverside Bridge', 'high'),
    ('P-105', 'Pump Station 105', 'Secondary water pump for Riverside backup', 'Pump', 'Riverside Bridge', 'medium'),
    ('V-201', 'Valve Assembly 201', 'Pressure regulation valve for north sector', 'Valve', 'North Plant', 'medium'),
    ('V-202', 'Valve Assembly 202', 'Emergency shutoff valve for north sector', 'Valve', 'North Plant', 'high'),
    ('G-301', 'Generator 301', 'Backup power generator for main facility', 'Generator', 'Main Facility', 'high'),
    ('T-401', 'Tank 401', 'Primary water storage tank', 'Tank', 'East Reservoir', 'high'),
    ('T-402', 'Tank 402', 'Secondary water storage tank', 'Tank', 'East Reservoir', 'medium'),
    ('M-501', 'Motor 501', 'Drive motor for conveyor system A', 'Motor', 'Processing Plant', 'medium'),
    ('S-601', 'Sensor Array 601', 'Water quality monitoring sensors', 'Sensor', 'Treatment Facility', 'high'),
    ('C-701', 'Control Panel 701', 'Main SCADA control interface', 'Control', 'Control Room', 'high')
ON CONFLICT (asset_id) DO NOTHING;

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'Nexus AEC database initialized successfully';
    RAISE NOTICE 'Seed data: % assets inserted', (SELECT COUNT(*) FROM assets);
END $$;

