-- Migration: Add Slack/Grain Integration Support
-- Created: 2026-01-24
-- Description: Extends database with source tracking, triage queue, OAuth tokens, and monitored channels

-- ============================================
-- EXTEND TASKS TABLE
-- ============================================
-- Add source tracking columns to existing tasks table
ALTER TABLE tasks ADD COLUMN source_type TEXT CHECK(source_type IN ('manual', 'slack', 'grain')) DEFAULT 'manual';
ALTER TABLE tasks ADD COLUMN source_id TEXT;
ALTER TABLE tasks ADD COLUMN source_url TEXT;
ALTER TABLE tasks ADD COLUMN source_meta TEXT; -- JSON string for flexible metadata

-- ============================================
-- TRIAGE QUEUE TABLE
-- ============================================
-- Stores AI-detected potential tasks awaiting user review
CREATE TABLE IF NOT EXISTS triage_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK(source_type IN ('slack', 'grain')),
    source_id TEXT NOT NULL,
    source_url TEXT,
    source_meta TEXT, -- JSON: message text, meeting title, participants, etc.

    -- AI-suggested fields (editable by user before adding to tasks)
    suggested_title TEXT NOT NULL,
    suggested_priority TEXT CHECK(suggested_priority IN ('Low', 'Medium', 'High')),
    suggested_due_date TEXT,
    ai_confidence_score REAL CHECK(ai_confidence_score >= 0 AND ai_confidence_score <= 1),
    ai_reasoning TEXT,

    -- User actions
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'added', 'dismissed')),
    created_task_id INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,

    FOREIGN KEY (created_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_triage_status ON triage_queue(status);
CREATE INDEX IF NOT EXISTS idx_triage_source ON triage_queue(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_triage_created_at ON triage_queue(created_at DESC);

-- ============================================
-- OAUTH TOKENS TABLE
-- ============================================
-- Stores encrypted OAuth tokens for Slack and Grain integrations
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL UNIQUE CHECK(service IN ('slack', 'grain')),
    access_token TEXT NOT NULL, -- Encrypted with AES-256-GCM
    refresh_token TEXT, -- Encrypted (if applicable)
    token_type TEXT DEFAULT 'Bearer',
    expires_at DATETIME,
    scope TEXT,
    workspace_id TEXT, -- Slack workspace ID or Grain workspace identifier
    workspace_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_service ON oauth_tokens(service);

-- ============================================
-- MONITORED CHANNELS TABLE
-- ============================================
-- Tracks which Slack channels are being monitored for task detection
CREATE TABLE IF NOT EXISTS monitored_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL CHECK(service IN ('slack')),
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    is_dm BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    last_scanned_at DATETIME,
    last_message_ts TEXT, -- Slack timestamp for cursor-based pagination
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(service, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_monitored_active ON monitored_channels(service, is_active);
CREATE INDEX IF NOT EXISTS idx_monitored_last_scanned ON monitored_channels(last_scanned_at);
