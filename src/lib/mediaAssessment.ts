import type {
  MediaClassification,
  MediaMethod,
  MediaResultType,
  MediaStance,
  EvidenceRelevance,
  MediaEvidenceRelationship,
} from '@/types';

export const classificationMeta: Record<
  MediaClassification,
  { color: string; bg: string; border: string; dot: string }
> = {
  likely_authentic: {
    color: 'text-success-400',
    bg: 'bg-success-500/10',
    border: 'border-success-500/30',
    dot: 'bg-success-500',
  },
  likely_ai_generated: {
    color: 'text-accent-300',
    bg: 'bg-accent-500/10',
    border: 'border-accent-500/30',
    dot: 'bg-accent-500',
  },
  likely_manipulated: {
    color: 'text-error-400',
    bg: 'bg-error-500/10',
    border: 'border-error-500/30',
    dot: 'bg-error-500',
  },
  misleading_context: {
    color: 'text-warning-400',
    bg: 'bg-warning-500/10',
    border: 'border-warning-500/30',
    dot: 'bg-warning-500',
  },
  inconclusive: {
    color: 'text-ink-400',
    bg: 'bg-ink-700/30',
    border: 'border-ink-600/40',
    dot: 'bg-ink-500',
  },
};

export const methodMeta: Record<MediaMethod, { icon: string; label: string }> = {
  metadata: { icon: 'FileImage', label: 'File metadata' },
  exif: { icon: 'MapPin', label: 'EXIF data' },
  c2pa: { icon: 'BadgeCheck', label: 'C2PA / Content Credentials' },
  dimensions: { icon: 'Maximize', label: 'Dimensions' },
  compression: { icon: 'Layers', label: 'Compression analysis' },
  visual_inconsistency: { icon: 'Eye', label: 'Visual inconsistency' },
  ai_detection: { icon: 'Sparkles', label: 'AI-generated detection' },
  temporal_consistency: { icon: 'Film', label: 'Temporal consistency' },
  av_sync: { icon: 'AudioLines', label: 'Audio/video sync' },
  provenance: { icon: 'History', label: 'Provenance' },
  source_search: { icon: 'Globe', label: 'Source investigation' },
};

export const resultTypeMeta: Record<MediaResultType, { color: string; bg: string }> = {
  signal: { color: 'text-accent-300', bg: 'bg-accent-500/10' },
  observation: { color: 'text-ink-300', bg: 'bg-ink-700/30' },
  limitation: { color: 'text-warning-400', bg: 'bg-warning-500/10' },
  unavailable: { color: 'text-ink-500', bg: 'bg-ink-800/50' },
};

export const stanceMeta: Record<MediaStance, { color: string; label: string }> = {
  supports_authentic: { color: 'text-success-400', label: 'Supports authentic' },
  supports_ai: { color: 'text-accent-300', label: 'Supports AI-generated' },
  supports_manipulation: { color: 'text-error-400', label: 'Supports manipulation' },
  supports_misleading: { color: 'text-warning-400', label: 'Supports misleading context' },
  neutral: { color: 'text-ink-400', label: 'Neutral' },
};

export function confidenceLabel(value: number | null): 'high' | 'medium' | 'low' {
  if (value == null) return 'low';
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

export function formatPercent(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const relevanceMeta: Record<EvidenceRelevance, string> = {
  high: 'text-success-400',
  medium: 'text-warning-400',
  low: 'text-ink-400',
};

export const relationshipMeta: Record<MediaEvidenceRelationship, string> = {
  earlier_appearance: 'Earlier appearance',
  similar_content: 'Similar content',
  original_publication: 'Original publication',
  independent_report: 'Independent report',
  context: 'Context',
};
