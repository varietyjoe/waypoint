-- Migration: Simplify Triage Queue Schema
-- Drop and recreate triage_queue with simpler schema

DROP TABLE IF EXISTS triage_queue;

CREATE TABLE IF NOT EXISTS triage_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL CHECK(source_type IN ('slack', 'grain')),
    source_id TEXT NOT NULL UNIQUE,
    source_url TEXT,
    content TEXT NOT NULL,
    metadata TEXT, -- JSON: channel info, participants, etc.
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'converted', 'dismissed')),
    converted_task_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (converted_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_triage_status ON triage_queue(status);
CREATE INDEX IF NOT EXISTS idx_triage_source ON triage_queue(source_type, source_id);
