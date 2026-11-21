import { useEffect, useState, useMemo } from 'react';
import { Search, Trash2, Eye, FileBarChart2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { getUserReports, deleteReport } from '@/lib/verification';
import { formatDate, formatPercent } from '@/lib/assessment';
import type { VerificationReport } from '@/types';

export function HistoryPage() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const [reports, setReports] = useState<VerificationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    getUserReports()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => (r.input_title ?? '').toLowerCase().includes(q));
  }, [reports, query]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('history_confirm_delete'))) return;
    setDeletingId(id);
    try {
      await deleteReport(id);
      setReports((rs) => rs.filter((r) => r.id !== id));
    } catch {
      // keep row visible on failure
    }
    setDeletingId(null);
  };

  return (
    <div className="section-pad">
      <div className="container-app max-w-4xl">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('history_title')}</h1>
        <p className="mt-2 text-ink-400">{t('history_subtitle')}</p>

        <div className="relative mt-6">
          <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input
            className="input-field ps-11"
            placeholder={t('history_search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mt-6 space-y-3">
          {loading ? (
            [1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-20" />)
          ) : filtered.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <FileBarChart2 className="w-10 h-10 text-ink-600 mx-auto" />
              <p className="mt-4 text-ink-400">{t('history_empty')}</p>
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="glass-card p-5 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-medium text-ink-100 truncate">{r.input_title ?? t('report_title_default')}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500 mt-1">
                    <span>{formatDate(r.created_at)}</span>
                    <span>{r.total_claims} {t('results_total_claims').toLowerCase()}</span>
                    {r.supported_count > 0 && <span className="text-success-400">{r.supported_count} {t('results_supported').toLowerCase()}</span>}
                    {r.contradicted_count > 0 && <span className="text-error-400">{r.contradicted_count} {t('results_contradicted').toLowerCase()}</span>}
                    <span>{t('results_confidence')}: {formatPercent(r.overall_confidence)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`badge ${
                    r.status === 'completed' ? 'bg-success-500/10 text-success-400'
                    : r.status === 'failed' ? 'bg-error-500/10 text-error-400'
                    : 'bg-warning-500/10 text-warning-400'
                  }`}>
                    {r.status}
                  </span>
                  <button
                    onClick={() => navigate(routeToPath({ name: 'results', id: r.id }))}
                    className="btn-secondary text-sm px-3 py-2"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {t('history_view')}
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="btn-ghost px-2 text-error-400 hover:bg-error-500/10"
                    disabled={deletingId === r.id}
                    aria-label={t('history_delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
