import { supabase } from '@/lib/supabase';
import type {
  MediaInvestigation,
  MediaInvestigationWithDetails,
  MediaFrame,
  MediaFinding,
  MediaEvidence,
  MediaType,
  MediaInputMethod,
} from '@/types';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/media-analyze`;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_VIDEO_EXTS = ['.mp4', '.mov', '.webm'];

export interface MediaSubmission {
  mediaType: MediaType;
  inputMethod: MediaInputMethod;
  file?: File;
  url?: string;
}

export function validateMediaSubmission(sub: MediaSubmission): string | null {
  if (sub.inputMethod === 'upload') {
    if (!sub.file) return 'media_error_no_file';
    const lower = sub.file.name.toLowerCase();
    if (sub.mediaType === 'image') {
      if (!ALLOWED_IMAGE_EXTS.some((ext) => lower.endsWith(ext))) return 'media_error_image_type';
      if (sub.file.size > MAX_IMAGE_BYTES) return 'media_error_image_size';
    } else {
      if (!ALLOWED_VIDEO_EXTS.some((ext) => lower.endsWith(ext))) return 'media_error_video_type';
      if (sub.file.size > MAX_VIDEO_BYTES) return 'media_error_video_size';
    }
  } else if (sub.inputMethod === 'url') {
    const url = sub.url?.trim() ?? '';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'error_url_invalid';
    } catch {
      return 'error_url_invalid';
    }
  } else {
    return 'error_empty';
  }
  return null;
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mime.toLowerCase());
}

export function isAllowedVideoMime(mime: string): boolean {
  return ALLOWED_VIDEO_TYPES.includes(mime.toLowerCase());
}

async function uploadToStorage(file: File, investigationId: string): Promise<{ path: string; url: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${investigationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('media-uploads').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data: urlData } = supabase.storage.from('media-uploads').getPublicUrl(path);
  return { path, url: urlData.publicUrl };
}

export async function submitMediaInvestigation(sub: MediaSubmission): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const isGuest = !sessionData.session?.user;

  const insertPayload: Record<string, unknown> = {
    is_guest: isGuest,
    media_type: sub.mediaType,
    input_method: sub.inputMethod,
    status: 'pending',
  };

  if (sub.inputMethod === 'url') {
    insertPayload.source_url = sub.url;
    insertPayload.media_url = sub.url;
    insertPayload.file_name = sub.url;
  }

  const { data: investigation, error } = await supabase
    .from('media_investigations')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !investigation) {
    throw new Error(error?.message ?? 'Failed to create investigation');
  }

  const investigationId = investigation.id;

  let uploadedUrl: string | undefined;
  let uploadedPath: string | undefined;
  let fileSize: number | undefined;
  let mimeType: string | undefined;
  let fileName: string | undefined;

  if (sub.inputMethod === 'upload' && sub.file) {
    try {
      const uploaded = await uploadToStorage(sub.file, investigationId);
      uploadedUrl = uploaded.url;
      uploadedPath = uploaded.path;
      fileSize = sub.file.size;
      mimeType = sub.file.type;
      fileName = sub.file.name;

      await supabase
        .from('media_investigations')
        .update({
          media_url: uploadedUrl,
          file_name: fileName,
          mime_type: mimeType,
          file_size_bytes: fileSize,
        })
        .eq('id', investigationId);
    } catch (err) {
      await supabase
        .from('media_investigations')
        .update({
          status: 'failed',
          error_message: `Upload failed: ${err instanceof Error ? err.message : 'unknown'}`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', investigationId);
      throw err;
    }
  }

  const payload: Record<string, unknown> = {
    investigationId,
    mediaType: sub.mediaType,
    inputMethod: sub.inputMethod,
  };
  if (sub.inputMethod === 'upload') {
    payload.mediaUrl = uploadedUrl;
    payload.storagePath = uploadedPath;
    payload.mimeType = mimeType;
    payload.fileName = fileName;
    payload.fileSize = fileSize;
  } else {
    payload.mediaUrl = sub.url;
  }

  callMediaEdgeFunction(payload).catch(async (err) => {
    await supabase
      .from('media_investigations')
      .update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Analysis failed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', investigationId);
  });

  return investigationId;
}

async function callMediaEdgeFunction(payload: Record<string, unknown>): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) {
    headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
  } else {
    headers['Authorization'] = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`;
  }

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Analysis request failed (${res.status})`);
  }
}

export async function getMediaInvestigation(id: string): Promise<MediaInvestigation | null> {
  const { data, error } = await supabase
    .from('media_investigations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MediaInvestigation | null;
}

export async function getMediaInvestigationWithDetails(id: string): Promise<MediaInvestigationWithDetails | null> {
  const investigation = await getMediaInvestigation(id);
  if (!investigation) return null;

  const [framesRes, findingsRes, evidenceRes] = await Promise.all([
    supabase.from('media_frames').select('*').eq('investigation_id', id).order('frame_order', { ascending: true }),
    supabase.from('media_findings').select('*').eq('investigation_id', id).order('created_at', { ascending: true }),
    supabase.from('media_evidence').select('*').eq('investigation_id', id).order('created_at', { ascending: true }),
  ]);

  if (framesRes.error) throw new Error(framesRes.error.message);
  if (findingsRes.error) throw new Error(findingsRes.error.message);
  if (evidenceRes.error) throw new Error(evidenceRes.error.message);

  return {
    ...investigation,
    frames: (framesRes.data ?? []) as MediaFrame[],
    findings: (findingsRes.data ?? []) as MediaFinding[],
    evidence: (evidenceRes.data ?? []) as MediaEvidence[],
  };
}

export async function getUserMediaInvestigations(): Promise<MediaInvestigation[]> {
  const { data, error } = await supabase
    .from('media_investigations')
    .select('*')
    .eq('is_guest', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MediaInvestigation[];
}

export async function deleteMediaInvestigation(id: string): Promise<void> {
  const { error } = await supabase
    .from('media_investigations')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function getMediaDashboardStats(): Promise<{
  total: number;
  authentic: number;
  aiGenerated: number;
  manipulated: number;
}> {
  const { data, error } = await supabase
    .from('media_investigations')
    .select('final_classification')
    .eq('is_guest', false)
    .eq('status', 'completed');
  if (error) throw new Error(error.message);

  const records = data ?? [];
  return {
    total: records.length,
    authentic: records.filter((r) => r.final_classification === 'likely_authentic').length,
    aiGenerated: records.filter((r) => r.final_classification === 'likely_ai_generated').length,
    manipulated: records.filter((r) => r.final_classification === 'likely_manipulated').length,
  };
}

export async function saveGuestMediaToUser(investigationId: string): Promise<void> {
  const { error } = await supabase
    .from('media_investigations')
    .update({ is_guest: false })
    .eq('id', investigationId);
  if (error) throw new Error(error.message);
}

export const MAX_IMAGE_SIZE = MAX_IMAGE_BYTES;
export const MAX_VIDEO_SIZE = MAX_VIDEO_BYTES;
