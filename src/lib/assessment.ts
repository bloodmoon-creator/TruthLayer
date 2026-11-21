import type { Assessment } from '@/types';

export const assessmentMeta: Record<
  Assessment,
  { color: string; bg: string; border: string; dot: string }
> = {
  supported: {
    color: 'text-success-400',
    bg: 'bg-success-500/10',
    border: 'border-success-500/30',
    dot: 'bg-success-500',
  },
  contradicted: {
    color: 'text-error-400',
    bg: 'bg-error-500/10',
    border: 'border-error-500/30',
    dot: 'bg-error-500',
  },
  partially_supported: {
    color: 'text-warning-400',
    bg: 'bg-warning-500/10',
    border: 'border-warning-500/30',
    dot: 'bg-warning-500',
  },
  insufficient: {
    color: 'text-ink-400',
    bg: 'bg-ink-700/30',
    border: 'border-ink-600/40',
    dot: 'bg-ink-500',
  },
};

export function confidenceLabel(value: number | null): 'high' | 'medium' | 'low' {
  if (value == null) return 'low';
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

export function confidenceColor(value: number | null): string {
  const label = confidenceLabel(value);
  if (label === 'high') return 'text-success-400';
  if (label === 'medium') return 'text-warning-400';
  return 'text-error-400';
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
