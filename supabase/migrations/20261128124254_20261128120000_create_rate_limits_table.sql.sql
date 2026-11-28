/*
# Create rate_limits table for server-side request throttling

## Purpose
Edge functions (verify, media-analyze) need server-side rate limiting to
prevent abuse. Each function invocation records a timestamped row keyed by
the caller's identity. Before processing a request, the function counts
rows in the current time window and rejects with HTTP 429 if the limit is
exceeded.

Identity is derived from the JWT subject (auth.uid()) for authenticated
users, or from a stable anon-key fingerprint for guests. This is an
internal table written and read only by the service_role (edge functions);
anon and authenticated roles have NO direct access.

## New Table
- `rate_limits`
  - id (uuid, pk)
  - identifier (text, not null) — stable per-caller key (auth uid or hashed anon fingerprint)
  - endpoint (text, not null) — which function: 'verify' or 'media-analyze'
  - created_at (timestamptz, not null, default now())
  - Index on (identifier, endpoint, created_at) for fast window queries.

## Security
- RLS enabled (deny-by-default; no anon/authenticated policies).
- Only service_role has INSERT and SELECT — the edge functions use the
  service role key, so they can read and write. No client-facing access.

## Notes
1. This table is append-only. Old rows accumulate but the index keeps
   window-count queries fast. A periodic cleanup can be run by an admin.
2. The edge functions never expose the raw identifier to the client.
3. Limits are enforced server-side and cannot be bypassed by changing
   client-side state.
*/

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL CHECK (endpoint IN ('verify', 'media-analyze')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON public.rate_limits (identifier, endpoint, created_at DESC);

-- service_role bypasses RLS but still needs explicit grants
GRANT SELECT, INSERT ON public.rate_limits TO service_role;

-- No grants to anon or authenticated: RLS deny-by-default means
-- client-side calls cannot read or write this table.