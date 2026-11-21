/*
# TruthLayer Media Intelligence Schema

## Overview
Adds multimodal media authenticity investigation to TruthLayer. Users upload
images or videos (or provide a media URL); the system runs a modular forensic
pipeline (metadata, EXIF, C2PA, frame extraction, AI-detection signals, source
investigation) and produces an interactive forensic report with a final
classification.

This migration mirrors the guest-capable multi-user pattern already used by
verification_reports: authenticated users own their rows; guests (anon) can
create and read only guest-scoped rows.

## New Tables

1. `media_investigations` — top-level record for one media investigation.
   - id (uuid, pk)
   - user_id (uuid, nullable, fk profiles, defaults auth.uid())
   - is_guest (bool, default false)
   - media_type (text: image | video)
   - input_method (text: upload | url)
   - file_name (text, nullable)
   - media_url (text, nullable) — public URL of stored/uploaded media
   - source_url (text, nullable) — URL provided by user (for url input)
   - mime_type (text, nullable)
   - file_size_bytes (bigint, nullable)
   - width (int, nullable), height (int, nullable)
   - duration_seconds (numeric, nullable — video only)
   - status (text: pending | processing | completed | failed)
   - final_classification (text: likely_authentic | likely_ai_generated | likely_manipulated | misleading_context | inconclusive)
   - overall_confidence (numeric(4,3))
   - overall_summary (text, nullable)
   - error_message (text, nullable)
   - created_at, completed_at (timestamptz)

2. `media_frames` — extracted frames from videos (and the single "frame" for images).
   - id (uuid, pk)
   - investigation_id (uuid, fk media_investigations CASCADE)
   - frame_order (int)
   - timestamp_seconds (numeric, nullable — video only)
   - storage_path (text) — path in the media-frames storage bucket
   - public_url (text)
   - width (int), height (int)
   - is_representative (bool, default false)
   - created_at (timestamptz)

3. `media_findings` — individual forensic analysis results (one per method per frame/investigation).
   - id (uuid, pk)
   - investigation_id (uuid, fk media_investigations CASCADE)
   - frame_id (uuid, nullable, fk media_frames CASCADE — null for investigation-level findings)
   - method (text: metadata | exif | c2pa | dimensions | compression | visual_inconsistency | ai_detection | temporal_consistency | av_sync | provenance | source_search)
   - result_type (text: signal | observation | limitation | unavailable)
   - label (text) — short human-readable label
   - detail (text) — full explanation
   - stance (text: supports_authentic | supports_ai | supports_manipulation | supports_misleading | neutral)
   - confidence (numeric(4,3), default 0)
   - raw_data (jsonb, nullable) — structured method output
   - created_at (timestamptz)

4. `media_evidence` — external source investigation results (reverse image search, earlier appearances, reporting).
   - id (uuid, pk)
   - investigation_id (uuid, fk media_investigations CASCADE)
   - source_title (text)
   - source_url (text)
   - publisher (text, nullable)
   - publication_date (date, nullable)
   - excerpt (text)
   - retrieval_date (date)
   - relevance (text: high | medium | low)
   - relationship (text: earlier_appearance | similar_content | original_publication | independent_report | context)
   - created_at (timestamptz)

## Storage
Creates a public storage bucket `media-uploads` for uploaded images/videos and
`media-frames` for extracted video frames. Both are public-read so the frontend
can display previews. Upload policies restrict to authenticated + anon (guest)
so the edge function and users can write.

## Security — RLS + Grants
All tables get RLS enabled.
- media_investigations: authenticated CRUD on own rows; anon CRUD on guest rows (is_guest=true, user_id null). service_role full access.
- media_frames, media_findings, media_evidence: scoped through parent investigation ownership (authenticated) or guest parent (anon). service_role full access.
- Storage: public-read buckets; authenticated + anon can upload.

## Important Notes
1. Guest investigations have user_id = NULL and is_guest = true — identical pattern to verification_reports.
2. service_role is granted on all tables because the media-analyze edge function (using SUPABASE_SERVICE_ROLE_KEY) writes findings, frames, and evidence.
3. The existing `handle_new_user()` trigger and all existing tables are untouched.
*/

-- ============================================================
-- media_investigations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_guest boolean NOT NULL DEFAULT false,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  input_method text NOT NULL CHECK (input_method IN ('upload', 'url')),
  file_name text,
  media_url text,
  source_url text,
  mime_type text,
  file_size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric(10,3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  final_classification text CHECK (final_classification IN ('likely_authentic', 'likely_ai_generated', 'likely_manipulated', 'misleading_context', 'inconclusive')),
  overall_confidence numeric(4,3),
  overall_summary text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.media_investigations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_media_inv_user_id ON public.media_investigations(user_id);
CREATE INDEX IF NOT EXISTS idx_media_inv_created_at ON public.media_investigations(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_investigations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_investigations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_investigations TO service_role;

-- Authenticated: own rows
DROP POLICY IF EXISTS "media_inv_select_own" ON public.media_investigations;
CREATE POLICY "media_inv_select_own" ON public.media_investigations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_inv_insert_own" ON public.media_investigations;
CREATE POLICY "media_inv_insert_own" ON public.media_investigations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_inv_update_own" ON public.media_investigations;
CREATE POLICY "media_inv_update_own" ON public.media_investigations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "media_inv_delete_own" ON public.media_investigations;
CREATE POLICY "media_inv_delete_own" ON public.media_investigations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Guest: guest-scoped rows
DROP POLICY IF EXISTS "media_inv_guest_select" ON public.media_investigations;
CREATE POLICY "media_inv_guest_select" ON public.media_investigations
  FOR SELECT TO anon USING (is_guest = true AND user_id IS NULL);

DROP POLICY IF EXISTS "media_inv_guest_insert" ON public.media_investigations;
CREATE POLICY "media_inv_guest_insert" ON public.media_investigations
  FOR INSERT TO anon WITH CHECK (is_guest = true AND user_id IS NULL);

DROP POLICY IF EXISTS "media_inv_guest_update" ON public.media_investigations;
CREATE POLICY "media_inv_guest_update" ON public.media_investigations
  FOR UPDATE TO anon USING (is_guest = true AND user_id IS NULL) WITH CHECK (is_guest = true AND user_id IS NULL);

DROP POLICY IF EXISTS "media_inv_guest_delete" ON public.media_investigations;
CREATE POLICY "media_inv_guest_delete" ON public.media_investigations
  FOR DELETE TO anon USING (is_guest = true AND user_id IS NULL);

-- ============================================================
-- media_frames
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.media_investigations(id) ON DELETE CASCADE,
  frame_order integer NOT NULL DEFAULT 0,
  timestamp_seconds numeric(10,3),
  storage_path text NOT NULL,
  public_url text NOT NULL,
  width integer,
  height integer,
  is_representative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_frames ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_media_frames_inv ON public.media_frames(investigation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_frames TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_frames TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_frames TO service_role;

-- Authenticated: scoped through parent ownership
DROP POLICY IF EXISTS "media_frames_select_own" ON public.media_frames;
CREATE POLICY "media_frames_select_own" ON public.media_frames
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_frames_insert_own" ON public.media_frames;
CREATE POLICY "media_frames_insert_own" ON public.media_frames
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_frames_update_own" ON public.media_frames;
CREATE POLICY "media_frames_update_own" ON public.media_frames
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_frames_delete_own" ON public.media_frames;
CREATE POLICY "media_frames_delete_own" ON public.media_frames
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.user_id = auth.uid())
  );

-- Guest: scoped through guest parent
DROP POLICY IF EXISTS "media_frames_guest_select" ON public.media_frames;
CREATE POLICY "media_frames_guest_select" ON public.media_frames
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

DROP POLICY IF EXISTS "media_frames_guest_insert" ON public.media_frames;
CREATE POLICY "media_frames_guest_insert" ON public.media_frames
  FOR INSERT TO anon WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

DROP POLICY IF EXISTS "media_frames_guest_update" ON public.media_frames;
CREATE POLICY "media_frames_guest_update" ON public.media_frames
  FOR UPDATE TO anon USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_frames.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

-- ============================================================
-- media_findings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.media_investigations(id) ON DELETE CASCADE,
  frame_id uuid REFERENCES public.media_frames(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('metadata','exif','c2pa','dimensions','compression','visual_inconsistency','ai_detection','temporal_consistency','av_sync','provenance','source_search')),
  result_type text NOT NULL CHECK (result_type IN ('signal','observation','limitation','unavailable')),
  label text NOT NULL,
  detail text NOT NULL,
  stance text NOT NULL DEFAULT 'neutral' CHECK (stance IN ('supports_authentic','supports_ai','supports_manipulation','supports_misleading','neutral')),
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_findings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_media_findings_inv ON public.media_findings(investigation_id);
CREATE INDEX IF NOT EXISTS idx_media_findings_frame ON public.media_findings(frame_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_findings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_findings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_findings TO service_role;

-- Authenticated: scoped through parent ownership
DROP POLICY IF EXISTS "media_findings_select_own" ON public.media_findings;
CREATE POLICY "media_findings_select_own" ON public.media_findings
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_findings_insert_own" ON public.media_findings;
CREATE POLICY "media_findings_insert_own" ON public.media_findings
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_findings_update_own" ON public.media_findings;
CREATE POLICY "media_findings_update_own" ON public.media_findings
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_findings_delete_own" ON public.media_findings;
CREATE POLICY "media_findings_delete_own" ON public.media_findings
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.user_id = auth.uid())
  );

-- Guest: scoped through guest parent
DROP POLICY IF EXISTS "media_findings_guest_select" ON public.media_findings;
CREATE POLICY "media_findings_guest_select" ON public.media_findings
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

DROP POLICY IF EXISTS "media_findings_guest_insert" ON public.media_findings;
CREATE POLICY "media_findings_guest_insert" ON public.media_findings
  FOR INSERT TO anon WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

DROP POLICY IF EXISTS "media_findings_guest_update" ON public.media_findings;
CREATE POLICY "media_findings_guest_update" ON public.media_findings
  FOR UPDATE TO anon USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_findings.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

-- ============================================================
-- media_evidence
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.media_investigations(id) ON DELETE CASCADE,
  source_title text NOT NULL,
  source_url text NOT NULL,
  publisher text,
  publication_date date,
  excerpt text NOT NULL,
  retrieval_date date NOT NULL DEFAULT CURRENT_DATE,
  relevance text NOT NULL DEFAULT 'medium' CHECK (relevance IN ('high','medium','low')),
  relationship text NOT NULL DEFAULT 'context' CHECK (relationship IN ('earlier_appearance','similar_content','original_publication','independent_report','context')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_evidence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_media_evidence_inv ON public.media_evidence(investigation_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_evidence TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_evidence TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_evidence TO service_role;

-- Authenticated: scoped through parent ownership
DROP POLICY IF EXISTS "media_evidence_select_own" ON public.media_evidence;
CREATE POLICY "media_evidence_select_own" ON public.media_evidence
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_evidence_insert_own" ON public.media_evidence;
CREATE POLICY "media_evidence_insert_own" ON public.media_evidence
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_evidence_update_own" ON public.media_evidence;
CREATE POLICY "media_evidence_update_own" ON public.media_evidence
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "media_evidence_delete_own" ON public.media_evidence;
CREATE POLICY "media_evidence_delete_own" ON public.media_evidence
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.user_id = auth.uid())
  );

-- Guest: scoped through guest parent
DROP POLICY IF EXISTS "media_evidence_guest_select" ON public.media_evidence;
CREATE POLICY "media_evidence_guest_select" ON public.media_evidence
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

DROP POLICY IF EXISTS "media_evidence_guest_insert" ON public.media_evidence;
CREATE POLICY "media_evidence_guest_insert" ON public.media_evidence
  FOR INSERT TO anon WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

DROP POLICY IF EXISTS "media_evidence_guest_update" ON public.media_evidence;
CREATE POLICY "media_evidence_guest_update" ON public.media_evidence
  FOR UPDATE TO anon USING (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.media_investigations m
      WHERE m.id = media_evidence.investigation_id AND m.is_guest = true AND m.user_id IS NULL)
  );

-- ============================================================
-- Storage buckets
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-uploads', 'media-uploads', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('media-frames', 'media-frames', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated + anon to upload and read
-- media-uploads
DROP POLICY IF EXISTS "media_uploads_read" ON storage.objects;
CREATE POLICY "media_uploads_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'media-uploads');

DROP POLICY IF EXISTS "media_uploads_write" ON storage.objects;
CREATE POLICY "media_uploads_write" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'media-uploads');

DROP POLICY IF EXISTS "media_uploads_delete" ON storage.objects;
CREATE POLICY "media_uploads_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'media-uploads');

-- media-frames (edge function writes extracted frames here)
DROP POLICY IF EXISTS "media_frames_read" ON storage.objects;
CREATE POLICY "media_frames_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'media-frames');

DROP POLICY IF EXISTS "media_frames_write" ON storage.objects;
CREATE POLICY "media_frames_write" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'media-frames');

DROP POLICY IF EXISTS "media_frames_delete" ON storage.objects;
CREATE POLICY "media_frames_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'media-frames');
