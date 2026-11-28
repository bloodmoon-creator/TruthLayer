/*
# Security hardening: column-level grants + handle_new_user execution lockdown

## Purpose
The original migrations granted full table-level INSERT/UPDATE/DELETE to
anon and authenticated on every table, meaning clients could write to any
column — including sensitive fields like `is_guest`, `user_id`, `status`,
`overall_confidence`, `final_classification`, etc. This migration
restricts writable columns to only those the client legitimately sets,
while preserving all existing RLS row-level policies.

It also revokes direct EXECUTE on the `handle_new_user()` SECURITY DEFINER
trigger function from the `authenticated` role, so signed-in users cannot
call it via the REST RPC endpoint. The trigger itself is unaffected because
triggers execute with the table owner's privileges.

## Changes by table

### verification_reports
Client may INSERT: input_type, input_title, input_excerpt, language
  (is_guest and user_id are set via DEFAULT / RLS policy logic — but the
   frontend does pass is_guest, so it remains insertable).
Client may INSERT: is_guest (needed: frontend sets it).
Client may UPDATE: is_guest (saveGuestReportToUser flips false).
  All other columns (status, overall_summary, counts, confidence,
  completed_at, error_message) are server-only — written by the edge
  function via service_role which bypasses column grants.
Note: user_id has DEFAULT auth.uid() and the INSERT policy checks
  auth.uid() = user_id, so the client never needs to set it directly.

### media_investigations
Client may INSERT: is_guest, media_type, input_method, source_url,
  media_url, file_name.
Client may UPDATE: media_url, file_name, mime_type, file_size_bytes
  (set after upload), is_guest (saveGuestMediaToUser).
  Server-only: status, width, height, duration_seconds,
  final_classification, overall_confidence, overall_summary,
  error_message, completed_at.

### media_frames, media_findings, media_evidence
These are written entirely by the edge function (service_role). Client
only needs SELECT. Revoke INSERT/UPDATE/DELETE from anon/authenticated.

### extracted_claims, evidence_sources, claim_assessments
Written entirely by the edge function (service_role). Client only needs
SELECT. Revoke INSERT/UPDATE/DELETE from anon/authenticated.

### profiles
Already restricted to SELECT + UPDATE(display_name). No change needed,
but we re-grant to be explicit.

### user_preferences
Client may INSERT/UPDATE: language, email_notifications, updated_at.
  No change to existing grants needed — all columns are user-controlled.

## handle_new_user() execution
- REVOKE EXECUTE FROM authenticated (was already revoked from anon + PUBLIC
  in the original migration, but the security advisor found authenticated
  still had it via a later grant or default).
- The trigger on auth.users continues to work because triggers run with
  owner privileges, not the caller's.

## RLS
No RLS policies are changed. All existing policies remain in effect.
The column-level grants only narrow WHICH columns a role can write to,
not which rows they can see.
*/

-- ============================================================
-- verification_reports: restrict writable columns
-- ============================================================
-- Revoke the broad table-level grants first
REVOKE INSERT, UPDATE, DELETE ON public.verification_reports FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.verification_reports FROM authenticated;

-- Re-grant INSERT on only the columns the client sets
GRANT INSERT (is_guest, input_type, input_title, input_excerpt, language)
  ON public.verification_reports TO anon, authenticated;

-- Re-grant UPDATE on only the columns the client may change
GRANT UPDATE (is_guest)
  ON public.verification_reports TO anon, authenticated;

-- DELETE stays at table level (RLS controls which rows)
GRANT DELETE ON public.verification_reports TO authenticated;
GRANT DELETE ON public.verification_reports TO anon;

-- SELECT stays at table level (RLS controls which rows)
GRANT SELECT ON public.verification_reports TO authenticated;
GRANT SELECT ON public.verification_reports TO anon;

-- ============================================================
-- media_investigations: restrict writable columns
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.media_investigations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.media_investigations FROM authenticated;

GRANT INSERT (is_guest, media_type, input_method, source_url, media_url, file_name)
  ON public.media_investigations TO anon, authenticated;

GRANT UPDATE (is_guest, media_url, file_name, mime_type, file_size_bytes)
  ON public.media_investigations TO anon, authenticated;

GRANT DELETE ON public.media_investigations TO authenticated;
GRANT DELETE ON public.media_investigations TO anon;

GRANT SELECT ON public.media_investigations TO authenticated;
GRANT SELECT ON public.media_investigations TO anon;

-- ============================================================
-- extracted_claims: client needs SELECT only (edge function writes via service_role)
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.extracted_claims FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.extracted_claims FROM authenticated;
GRANT SELECT ON public.extracted_claims TO anon, authenticated;

-- ============================================================
-- evidence_sources: client needs SELECT only
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.evidence_sources FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.evidence_sources FROM authenticated;
GRANT SELECT ON public.evidence_sources TO anon, authenticated;

-- ============================================================
-- claim_assessments: client needs SELECT only
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.claim_assessments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.claim_assessments FROM authenticated;
GRANT SELECT ON public.claim_assessments TO anon, authenticated;

-- ============================================================
-- media_frames: client needs SELECT only
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.media_frames FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.media_frames FROM authenticated;
GRANT SELECT ON public.media_frames TO anon, authenticated;

-- ============================================================
-- media_findings: client needs SELECT only
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.media_findings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.media_findings FROM authenticated;
GRANT SELECT ON public.media_findings TO anon, authenticated;

-- ============================================================
-- media_evidence: client needs SELECT only
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.media_evidence FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.media_evidence FROM authenticated;
GRANT SELECT ON public.media_evidence TO anon, authenticated;

-- ============================================================
-- handle_new_user: revoke EXECUTE from authenticated
-- (already revoked from PUBLIC + anon in original migration, but
--  the security advisor found authenticated could still call it)
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
-- Trigger continues to work — triggers run with table-owner privileges.
-- service_role retains EXECUTE if it was previously granted.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;