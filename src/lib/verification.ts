import { supabase } from '@/lib/supabase';
import type {
  VerificationReport,
  ReportWithDetails,
  ClaimWithDetails,
  EvidenceSource,
  ClaimAssessment,
  InputType,
  LanguageCode,
} from '@/types';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify`;

const MAX_TEXT = 15000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface VerificationSubmission {
  inputType: InputType;
  text?: string;
  url?: string;
  fileName?: string;
  fileContent?: string;
  language?: LanguageCode;
}

export function validateSubmission(sub: VerificationSubmission): string | null {
  if (sub.inputType === 'text') {
    const text = sub.text?.trim() ?? '';
    if (text.length < 50) return 'error_text_short';
    if (text.length > MAX_TEXT) return 'error_text_long';
  } else if (sub.inputType === 'url') {
    const url = sub.url?.trim() ?? '';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'error_url_invalid';
    } catch {
      return 'error_url_invalid';
    }
  } else if (sub.inputType === 'document') {
    if (!sub.fileName || !sub.fileContent) return 'error_empty';
    if (sub.fileContent.length > MAX_FILE_BYTES * 1.34) return 'error_file_size';
    const lower = sub.fileName.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.txt')) return 'error_file_type';
  } else {
    return 'error_empty';
  }
  return null;
}

function makeExcerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 200 ? trimmed.slice(0, 200) + '…' : trimmed;
}

async function callEdgeFunction(payload: Record<string, unknown>, reportId: string): Promise<void> {
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
    body: JSON.stringify({ ...payload, reportId }),
  });

  if (!res.ok) {
    throw new Error(`Verification request failed (${res.status})`);
  }
}

export async function submitVerification(sub: VerificationSubmission): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const isGuest = !sessionData.session?.user;

  const excerpt = sub.inputType === 'text'
    ? makeExcerpt(sub.text ?? '')
    : sub.inputType === 'url'
    ? sub.url ?? ''
    : sub.fileName ?? '';

  const insertPayload = {
    is_guest: isGuest,
    input_type: sub.inputType,
    input_title: excerpt,
    input_excerpt: excerpt,
    status: 'pending',
    language: sub.language ?? 'en',
  };

  const { data: report, error } = await supabase
    .from('verification_reports')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !report) {
    throw new Error(error?.message ?? 'Failed to create report');
  }

  const reportId = report.id;

  const payload: Record<string, unknown> = {
    inputType: sub.inputType,
    language: sub.language ?? 'en',
  };
  if (sub.inputType === 'text') payload.text = sub.text;
  if (sub.inputType === 'url') payload.url = sub.url;
  if (sub.inputType === 'document') {
    payload.fileName = sub.fileName;
    payload.fileContent = sub.fileContent;
  }

  callEdgeFunction(payload, reportId).catch(async (err) => {
    await supabase
      .from('verification_reports')
      .update({ status: 'failed', error_message: err.message, completed_at: new Date().toISOString() })
      .eq('id', reportId);
  });

  return reportId;
}

export async function getReport(reportId: string): Promise<VerificationReport | null> {
  const { data, error } = await supabase
    .from('verification_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as VerificationReport | null;
}

export async function getReportWithDetails(reportId: string): Promise<ReportWithDetails | null> {
  const report = await getReport(reportId);
  if (!report) return null;

  const { data: claims, error: claimsError } = await supabase
    .from('extracted_claims')
    .select('*, assessment:claim_assessments(*), evidence:evidence_sources(*)')
    .eq('report_id', reportId)
    .order('claim_order', { ascending: true });

  if (claimsError) throw new Error(claimsError.message);

  const detailedClaims: ClaimWithDetails[] = (claims ?? []).map((c: Record<string, unknown>) => {
    const assessment = Array.isArray(c.assessment) ? (c.assessment[0] as ClaimAssessment) : (c.assessment as ClaimAssessment | null);
    const evidence = Array.isArray(c.evidence) ? (c.evidence as EvidenceSource[]) : [];
    return {
      id: c.id as string,
      report_id: c.report_id as string,
      claim_text: c.claim_text as string,
      context: c.context as string | null,
      claim_order: c.claim_order as number,
      created_at: c.created_at as string,
      assessment,
      evidence,
    };
  });

  return { ...report, claims: detailedClaims };
}

export async function getUserReports(): Promise<VerificationReport[]> {
  const { data, error } = await supabase
    .from('verification_reports')
    .select('*')
    .eq('is_guest', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as VerificationReport[];
}

export async function deleteReport(reportId: string): Promise<void> {
  const { error } = await supabase
    .from('verification_reports')
    .delete()
    .eq('id', reportId);
  if (error) throw new Error(error.message);
}

export async function getDashboardStats(): Promise<{
  total: number;
  supported: number;
  contradicted: number;
  avgConfidence: number | null;
}> {
  const { data, error } = await supabase
    .from('verification_reports')
    .select('total_claims, supported_count, contradicted_count, overall_confidence')
    .eq('is_guest', false)
    .eq('status', 'completed');
  if (error) throw new Error(error.message);

  const reports = data ?? [];
  const total = reports.length;
  const supported = reports.reduce((s, r) => s + (r.supported_count ?? 0), 0);
  const contradicted = reports.reduce((s, r) => s + (r.contradicted_count ?? 0), 0);
  const confReports = reports.filter((r) => r.overall_confidence != null);
  const avgConfidence = confReports.length > 0
    ? confReports.reduce((s, r) => s + Number(r.overall_confidence), 0) / confReports.length
    : null;

  return { total, supported, contradicted, avgConfidence };
}

export async function saveGuestReportToUser(reportId: string): Promise<void> {
  const { error } = await supabase
    .from('verification_reports')
    .update({ is_guest: false })
    .eq('id', reportId);
  if (error) throw new Error(error.message);
}
