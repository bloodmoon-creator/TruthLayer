import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getMediaInvestigationWithDetails } from '@/lib/mediaApi';
import type { MediaInvestigationWithDetails, MediaFrame, MediaFinding, MediaEvidence } from '@/types';

export function useMediaPolling(investigationId: string) {
  const [investigation, setInvestigation] = useState<MediaInvestigationWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchInvestigation = useCallback(async () => {
    const data = await getMediaInvestigationWithDetails(investigationId);
    if (!data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setInvestigation(data);
    setLoading(false);
  }, [investigationId]);

  useEffect(() => {
    fetchInvestigation();
  }, [fetchInvestigation]);

  useEffect(() => {
    if (!investigation || (investigation.status !== 'pending' && investigation.status !== 'processing')) return;
    const timer = setTimeout(fetchInvestigation, 3000);
    return () => clearTimeout(timer);
  }, [investigation, fetchInvestigation]);

  return { investigation, loading, notFound };
}
