-- ============================================================================
-- Last Chance Platform — Phase 1: Database Schema
-- Migration 0001: PostgreSQL extensions
-- Target engine: PostgreSQL 16+ with PostGIS 3.4+
-- ============================================================================

-- GIST operator support for scalar types (uuid, enum) so they can participate
-- in EXCLUDE constraints alongside range types. Required for the overlap guard.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Geospatial types and indexes: property coordinates, radius search fallback.
-- (Primary geo-search runs in OpenSearch; PostGIS is the source of truth.)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Case-insensitive text for emails (avoids lower() gymnastics everywhere).
CREATE EXTENSION IF NOT EXISTS citext;

-- gen_random_bytes() for human-readable booking reference codes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigram GIN indexes for fuzzy property-name lookups (admin/back-office).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
