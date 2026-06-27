-- Add a per-kid HELPER (chosen character + voice) to kid_profiles.
-- Additive + idempotent. Stores { name, image, description, voice } from Helper Lab.
-- Safe to run multiple times.
alter table if exists kid_profiles add column if not exists helper jsonb;
