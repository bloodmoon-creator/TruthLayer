import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ReportWithDetails, ClaimWithDetails } from '@/types';
import { ReportView } from '@/components/ReportView';

export function useReportPolling(reportId: string) {
  const [report, setReport] = useState<ReportWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchReport = useCallback(async () => {
    const { data: r } = await supabase
      .from('verification_reports')
      .select('*')
      .eq('id', reportId)
      .maybeSingle();
    if (!r) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const { data: claims } = await supabase
      .from('extracted_claims')
      .select('*, assessment:claim_assessments(*), evidence:evidence_sources(*)')
      .eq('report_id', reportId)
      .order('claim_order', { ascending: true });

    const detailed: ClaimWithDetails[] = (claims ?? []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      report_id: c.report_id as string,
      claim_text: c.claim_text as string,
      context: c.context as string | null,
      claim_order: c.claim_order as number,
      created_at: c.created_at as string,
      assessment: Array.isArray(c.assessment) ? c.assessment[0] ?? null : (c.assessment as ClaimWithDetails['assessment']),
      evidence: Array.isArray(c.evidence) ? c.evidence : [],
    }));

    setReport({ ...(r as ReportWithDetails), claims: detailed });
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (!report || (report.status !== 'pending' && report.status !== 'processing')) return;
    const timer = setTimeout(fetchReport, 3000);
    return () => clearTimeout(timer);
  }, [report, fetchReport]);

  return { report, loading, notFound };
}
