-- db/create-image-cache.sql
-- Reusable AI image library cache. Generate each image once (OpenAI gpt-image-1),
-- store its base64 PNG keyed by a deterministic hash of its descriptor, and serve
-- it by a short URL via /api/images. Identical requests reuse the cached row, so
-- every unique image is billed once and reuse is free + instant.
-- Run ONCE in the Supabase SQL editor. Idempotent.

create table if not exists image_cache (
  cache_key  text primary key,           -- "img:" + sha1(descriptor)
  descriptor text,                        -- human-readable, e.g. "cover|happy|space"
  b64        text not null,               -- base64 PNG (no "data:" prefix)
  kind       text,                         -- "cover" | "icon" | ...
  created_at timestamptz not null default now()
);

create index if not exists image_cache_kind_idx on image_cache (kind, created_at desc);

-- Served by the service key only (server-side). No public RLS policy needed; the
-- /api/images route reads it with the service key and returns raw PNG bytes.
alter table image_cache enable row level security;

-- Verify:  select kind, count(*) from image_cache group by kind;
