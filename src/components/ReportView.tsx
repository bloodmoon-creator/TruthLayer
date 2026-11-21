import { ExternalLink, FileText, CheckCircle2, XCircle, AlertTriangle, HelpCircle, ShieldCheck } from 'lucide-react';
import type { ReportWithDetails, ClaimWithDetails, Assessment } from '@/types';
import { assessmentMeta, confidenceLabel, formatPercent, formatDate } from '@/lib/assessment';
import { useI18n } from '@/i18n/I18nProvider';

const verdictIcon: Record<Assessment, typeof CheckCircle2> = {
  supported: CheckCircle2,
  contradicted: XCircle,
  partially_supported: AlertTriangle,
  insufficient: HelpCircle,
};

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass-card p-4">
      <div className={`text-2xl font-display font-semibold ${tone ?? 'text-ink-100'}`}>{value}</div>
      <div className="text-xs text-ink-400 mt-1">{label}</div>
    </div>
  );
}

function ClaimCard({ claim, index }: { claim: ClaimWithDetails; index: number }) {
  const { t } = useI18n();
  const assessment = claim.assessment?.assessment;
  const meta = assessment ? assessmentMeta[assessment] : assessmentMeta.insufficient;
  const Icon = assessment ? verdictIcon[assessment] : HelpCircle;

  return (
    <div className={`glass-card p-5 border ${meta.border}`} style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-ink-100 leading-relaxed font-medium">{claim.claim_text}</p>
        <span className={`badge shrink-0 ${meta.bg} ${meta.color} border ${meta.border}`}>
          <Icon className="w-3.5 h-3.5" />
          {assessment ? t(`results_${assessment === 'partially_supported' ? 'partial' : assessment}` as never) : '—'}
        </span>
      </div>

      {claim.assessment && (
        <div className="mt-4">
          <h5 className="text-xs uppercase tracking-wide text-ink-500 mb-1">{t('results_explanation')}</h5>
          <p className="text-sm text-ink-300 leading-relaxed">{claim.assessment.explanation}</p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-ink-500">{t('results_confidence')}:</span>
            <div className="w-24 h-1.5 bg-ink-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  confidenceLabel(claim.assessment.confidence) === 'high'
                    ? 'bg-success-500'
                    : confidenceLabel(claim.assessment.confidence) === 'medium'
                    ? 'bg-warning-500'
                    : 'bg-error-500'
                }`}
                style={{ width: `${Math.round(claim.assessment.confidence * 100)}%` }}
              />
            </div>
            <span className="text-ink-300">{formatPercent(claim.assessment.confidence)}</span>
          </div>
        </div>
      )}

      {claim.evidence.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <h5 className="text-xs uppercase tracking-wide text-ink-500 mb-2">{t('results_evidence')}</h5>
          <div className="space-y-2">
            {claim.evidence.map((ev) => (
              <a
                key={ev.id}
                href={ev.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block rounded-xl bg-ink-950/60 border border-white/[0.06] p-3 hover:border-accent-500/40 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-100 truncate group-hover:text-accent-300 transition-colors">
                      {ev.source_title}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5 truncate">
                      {ev.publisher} · {formatDate(ev.publication_date)}
                    </div>
                    <p className="text-xs text-ink-400 mt-1.5 leading-relaxed line-clamp-2">{ev.excerpt}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`badge ${
                        ev.stance === 'supports'
                          ? 'bg-success-500/10 text-success-400'
                          : ev.stance === 'contradicts'
                          ? 'bg-error-500/10 text-error-400'
                          : 'bg-ink-700/40 text-ink-300'
                      }`}
                    >
                      {ev.stance}
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-ink-500" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportView({ report }: { report: ReportWithDetails }) {
  const { t } = useI18n();

  if (report.status === 'pending' || report.status === 'processing') {
    return (
      <div className="glass-card p-10 text-center">
        <ShieldCheck className="w-10 h-10 text-accent-400 mx-auto animate-pulse" />
        <p className="mt-4 text-ink-200">{t('results_processing')}</p>
        <p className="mt-2 text-sm text-ink-500">{t('submit_processing')}</p>
      </div>
    );
  }

  if (report.status === 'failed') {
    return (
      <div className="glass-card p-10 text-center border-error-500/30">
        <XCircle className="w-10 h-10 text-error-400 mx-auto" />
        <p className="mt-4 text-ink-200">{t('results_failed')}</p>
        {report.error_message && <p className="mt-2 text-sm text-ink-500">{report.error_message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label={t('results_total_claims')} value={String(report.total_claims)} />
        <StatCard label={t('results_supported')} value={String(report.supported_count)} tone="text-success-400" />
        <StatCard label={t('results_partial')} value={String(report.partial_count)} tone="text-warning-400" />
        <StatCard label={t('results_contradicted')} value={String(report.contradicted_count)} tone="text-error-400" />
        <StatCard label={t('results_confidence')} value={formatPercent(report.overall_confidence)} />
      </div>

      {report.overall_summary && (
        <div className="glass-card p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-200 mb-2">
            <FileText className="w-4 h-4 text-accent-400" />
            {t('results_summary')}
          </h3>
          <p className="text-sm text-ink-300 leading-relaxed">{report.overall_summary}</p>
        </div>
      )}

      <div>
        <h3 className="text-lg font-display font-semibold text-ink-100 mb-3">{t('results_claims')}</h3>
        {report.claims.length === 0 ? (
          <div className="glass-card p-8 text-center text-ink-400">{t('results_no_claims')}</div>
        ) : (
          <div className="space-y-4">
            {report.claims.map((claim, i) => (
              <ClaimCard key={claim.id} claim={claim} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
