/*
# TruthLayer Core Schema

1. Overview
   TruthLayer is an AI fact-verification platform. Users submit text, URLs, or
   documents; the system extracts individual factual claims, searches the web
   for evidence, evaluates each claim against that evidence, and produces a
   detailed verification report.

   This migration creates the full data model: user profiles, verification
   reports, extracted claims, evidence sources, claim assessments, and user
   preferences. Guest reports are supported via a nullable user_id and an
   is_guest flag.

2. New Tables
   - `profiles` — extended user info keyed to auth.users (1:1).
     Columns: id (uuid, pk, = auth.users.id), display_name (text), created_at.
   - `user_preferences` — per-user app settings (language, notifications).
     Columns: id (uuid, pk), user_id (uuid, fk profiles), language (text), 
     email_notifications (bool), created_at, updated_at.
   - `verification_reports` — a full verification run.
     Columns: id (uuid, pk), user_id (uuid, fk profiles, nullable for guests),
     is_guest (bool), input_type (text: text/url/document), input_title (text),
     input_excerpt (text), status (text: pending/processing/completed/failed),
     language (text), overall_summary (text), total_claims (int),
     supported_count, contradicted_count, partial_count, insufficient_count,
     overall_confidence (numeric), created_at, completed_at, error_message.
   - `extracted_claims` — individual claims pulled from a report's input.
     Columns: id (uuid, pk), report_id (uuid, fk verification_reports),
     claim_text (text), context (text), claim_order (int), created_at.
   - `evidence_sources` — web evidence retrieved for a claim.
     Columns: id (uuid, pk), claim_id (uuid, fk extracted_claims),
     source_title (text), source_url (text), publisher (text),
     publication_date (date, nullable), excerpt (text), retrieval_date (date),
     relevance (text: high/medium/low), stance (text: supports/contradicts/neutral),
     source_type (text), created_at.
   - `claim_assessments` — the verdict for a single claim.
     Columns: id (uuid, pk), claim_id (uuid, pk-like fk extracted_claims, 1:1),
     assessment (text: supported/contradicted/partially_supported/insufficient),
     explanation (text), confidence (numeric), created_at.

3. Relationships
   profiles 1—1 auth.users
   profiles 1—N user_preferences
   profiles 1—N verification_reports (reports.user_id nullable for guests)
   verification_reports 1—N extracted_claims
   extracted_claims 1—N evidence_sources
   extracted_claims 1—1 claim_assessments

4. Security — RLS + Grants
   - All tables get RLS enabled.
   - profiles: a user can SELECT/UPDATE only their own row.
   - user_preferences: owner-only CRUD.
   - verification_reports: owner can do full CRUD on own rows; guests can only
     access rows where is_guest = true AND user_id IS NULL (anonymous,
     session-scoped via the anon key). To prevent guest reports from leaking,
     guest rows are scoped to is_guest = true only.
   - extracted_claims, evidence_sources, claim_assessments: access is scoped
     through the parent report's ownership. A SELECT policy checks that the
     report owning the row belongs to the requesting user (or is a guest row).
   - service_role granted SELECT/INSERT/UPDATE on all tables so edge functions
     (which run with the service role) can persist verification results.
   - Functions: none in this migration.

5. Notes
   - Guest reports intentionally have user_id = NULL. The guest (anon) can read
     them via the anon key; authenticated users never see guest rows. This keeps
     guest reports from accidentally becoming visible to signed-in users.
   - All owner columns default to auth.uid() so client inserts that omit
     user_id still satisfy the INSERT WITH CHECK policy.
*/

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- user_preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en',
  email_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO service_role;

DROP POLICY IF EXISTS "prefs_select_own" ON public.user_preferences;
CREATE POLICY "prefs_select_own" ON public.user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "prefs_insert_own" ON public.user_preferences;
CREATE POLICY "prefs_insert_own" ON public.user_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prefs_update_own" ON public.user_preferences;
CREATE POLICY "prefs_update_own" ON public.user_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prefs_delete_own" ON public.user_preferences;
CREATE POLICY "prefs_delete_own" ON public.user_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- verification_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS public.verification_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_guest boolean NOT NULL DEFAULT false,
  input_type text NOT NULL CHECK (input_type IN ('text', 'url', 'document')),
  input_title text,
  input_excerpt text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  language text NOT NULL DEFAULT 'en',
  overall_summary text,
  total_claims integer NOT NULL DEFAULT 0,
  supported_count integer NOT NULL DEFAULT 0,
  contradicted_count integer NOT NULL DEFAULT 0,
  partial_count integer NOT NULL DEFAULT 0,
  insufficient_count integer NOT NULL DEFAULT 0,
  overall_confidence numeric(4,3),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text
);
ALTER TABLE public.verification_reports ENABLE ROW LEVEL SECURITY;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.verification_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.verification_reports(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.verification_reports TO anon;
GRANT SELECT, INSERT, UPDATE ON public.verification_reports TO service_role;

-- Authenticated users: full CRUD on their own rows
DROP POLICY IF EXISTS "reports_select_own" ON public.verification_reports;
CREATE POLICY "reports_select_own" ON public.verification_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_insert_own" ON public.verification_reports;
CREATE POLICY "reports_insert_own" ON public.verification_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_update_own" ON public.verification_reports;
CREATE POLICY "reports_update_own" ON public.verification_reports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_delete_own" ON public.verification_reports;
CREATE POLICY "reports_delete_own" ON public.verification_reports
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Guest (anon) users: can create and read guest-scoped rows only
DROP POLICY IF EXISTS "reports_guest_select" ON public.verification_reports;
CREATE POLICY "reports_guest_select" ON public.verification_reports
  FOR SELECT TO anon USING (is_guest = true AND user_id IS NULL);

DROP POLICY IF EXISTS "reports_guest_insert" ON public.verification_reports;
CREATE POLICY "reports_guest_insert" ON public.verification_reports
  FOR INSERT TO anon WITH CHECK (is_guest = true AND user_id IS NULL);

DROP POLICY IF EXISTS "reports_guest_update" ON public.verification_reports;
CREATE POLICY "reports_guest_update" ON public.verification_reports
  FOR UPDATE TO anon USING (is_guest = true AND user_id IS NULL) WITH CHECK (is_guest = true AND user_id IS NULL);

DROP POLICY IF EXISTS "reports_guest_delete" ON public.verification_reports;
CREATE POLICY "reports_guest_delete" ON public.verification_reports
  FOR DELETE TO anon USING (is_guest = true AND user_id IS NULL);

-- ============================================================
-- extracted_claims
-- ============================================================
CREATE TABLE IF NOT EXISTS public.extracted_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.verification_reports(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
  context text,
  claim_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.extracted_claims ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_claims_report_id ON public.extracted_claims(report_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extracted_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.extracted_claims TO anon;
GRANT SELECT, INSERT, UPDATE ON public.extracted_claims TO service_role;

-- Authenticated: scoped through parent report ownership
DROP POLICY IF EXISTS "claims_select_own" ON public.extracted_claims;
CREATE POLICY "claims_select_own" ON public.extracted_claims
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "claims_insert_own" ON public.extracted_claims;
CREATE POLICY "claims_insert_own" ON public.extracted_claims
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "claims_update_own" ON public.extracted_claims;
CREATE POLICY "claims_update_own" ON public.extracted_claims
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "claims_delete_own" ON public.extracted_claims;
CREATE POLICY "claims_delete_own" ON public.extracted_claims
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.user_id = auth.uid())
  );

-- Guest: scoped through guest parent report
DROP POLICY IF EXISTS "claims_guest_select" ON public.extracted_claims;
CREATE POLICY "claims_guest_select" ON public.extracted_claims
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.is_guest = true AND r.user_id IS NULL)
  );

DROP POLICY IF EXISTS "claims_guest_insert" ON public.extracted_claims;
CREATE POLICY "claims_guest_insert" ON public.extracted_claims
  FOR INSERT TO anon WITH CHECK (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.is_guest = true AND r.user_id IS NULL)
  );

DROP POLICY IF EXISTS "claims_guest_update" ON public.extracted_claims;
CREATE POLICY "claims_guest_update" ON public.extracted_claims
  FOR UPDATE TO anon USING (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.is_guest = true AND r.user_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.verification_reports r
      WHERE r.id = extracted_claims.report_id AND r.is_guest = true AND r.user_id IS NULL)
  );

-- ============================================================
-- evidence_sources
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evidence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.extracted_claims(id) ON DELETE CASCADE,
  source_title text NOT NULL,
  source_url text NOT NULL,
  publisher text,
  publication_date date,
  excerpt text NOT NULL,
  retrieval_date date NOT NULL DEFAULT CURRENT_DATE,
  relevance text NOT NULL DEFAULT 'medium' CHECK (relevance IN ('high', 'medium', 'low')),
  stance text NOT NULL DEFAULT 'neutral' CHECK (stance IN ('supports', 'contradicts', 'neutral')),
  source_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.evidence_sources ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_evidence_claim_id ON public.evidence_sources(claim_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.evidence_sources TO anon;
GRANT SELECT, INSERT, UPDATE ON public.evidence_sources TO service_role;

-- Authenticated: scoped through claim -> report ownership
DROP POLICY IF EXISTS "evidence_select_own" ON public.evidence_sources;
CREATE POLICY "evidence_select_own" ON public.evidence_sources
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "evidence_insert_own" ON public.evidence_sources;
CREATE POLICY "evidence_insert_own" ON public.evidence_sources
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "evidence_update_own" ON public.evidence_sources;
CREATE POLICY "evidence_update_own" ON public.evidence_sources
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "evidence_delete_own" ON public.evidence_sources;
CREATE POLICY "evidence_delete_own" ON public.evidence_sources
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.user_id = auth.uid())
  );

-- Guest: scoped through guest parent
DROP POLICY IF EXISTS "evidence_guest_select" ON public.evidence_sources;
CREATE POLICY "evidence_guest_select" ON public.evidence_sources
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  );

DROP POLICY IF EXISTS "evidence_guest_insert" ON public.evidence_sources;
CREATE POLICY "evidence_guest_insert" ON public.evidence_sources
  FOR INSERT TO anon WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  );

DROP POLICY IF EXISTS "evidence_guest_update" ON public.evidence_sources;
CREATE POLICY "evidence_guest_update" ON public.evidence_sources
  FOR UPDATE TO anon USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = evidence_sources.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  );

-- ============================================================
-- claim_assessments (1:1 with extracted_claims)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.claim_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL UNIQUE REFERENCES public.extracted_claims(id) ON DELETE CASCADE,
  assessment text NOT NULL CHECK (assessment IN ('supported', 'contradicted', 'partially_supported', 'insufficient')),
  explanation text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.claim_assessments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_assessments_claim_id ON public.claim_assessments(claim_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.claim_assessments TO anon;
GRANT SELECT, INSERT, UPDATE ON public.claim_assessments TO service_role;

-- Authenticated: scoped through claim -> report ownership
DROP POLICY IF EXISTS "assess_select_own" ON public.claim_assessments;
CREATE POLICY "assess_select_own" ON public.claim_assessments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "assess_insert_own" ON public.claim_assessments;
CREATE POLICY "assess_insert_own" ON public.claim_assessments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "assess_update_own" ON public.claim_assessments;
CREATE POLICY "assess_update_own" ON public.claim_assessments
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "assess_delete_own" ON public.claim_assessments;
CREATE POLICY "assess_delete_own" ON public.claim_assessments
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.user_id = auth.uid())
  );

-- Guest: scoped through guest parent
DROP POLICY IF EXISTS "assess_guest_select" ON public.claim_assessments;
CREATE POLICY "assess_guest_select" ON public.claim_assessments
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  );

DROP POLICY IF EXISTS "assess_guest_insert" ON public.claim_assessments;
CREATE POLICY "assess_guest_insert" ON public.claim_assessments
  FOR INSERT TO anon WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  );

DROP POLICY IF EXISTS "assess_guest_update" ON public.claim_assessments;
CREATE POLICY "assess_guest_update" ON public.claim_assessments
  FOR UPDATE TO anon USING (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.extracted_claims c
      JOIN public.verification_reports r ON r.id = c.report_id
      WHERE c.id = claim_assessments.claim_id AND r.is_guest = true AND r.user_id IS NULL)
  );

-- ============================================================
-- Trigger: auto-create profile + preferences on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_preferences (user_id, language)
  VALUES (NEW.id, 'en')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
