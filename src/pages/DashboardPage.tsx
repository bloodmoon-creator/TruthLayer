import { useEffect, useState } from 'react';
import { FileBarChart2, CheckCircle2, XCircle, Gauge, ArrowRight, Plus } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { getDashboardStats, getUserReports } from '@/lib/verification';
import { formatPercent, formatDate } from '@/lib/assessment';
import type { VerificationReport } from '@/types';

export function DashboardPage() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<{ total: number; supported: number; contradicted: number; avgConfidence: number | null } | null>(null);
  const [recent, setRecent] = useState<VerificationReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([getDashboardStats(), getUserReports()])
      .then(([s, reports]) => {
        setStats(s);
        setRecent(reports.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="section-pad">
        <div className="container-app max-w-lg text-center">
          <div className="glass-card p-10">
            <h1 className="text-2xl font-display font-bold text-gradient">{t('dashboard_title')}</h1>
            <p className="mt-3 text-ink-400">{t('results_save_hint')}</p>
            <div className="mt-6 flex justify-center gap-2">
              <button onClick={() => navigate('/login')} className="btn-secondary">{t('nav_login')}</button>
              <button onClick={() => navigate('/register')} className="btn-primary">{t('nav_register')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cards = [
    { icon: FileBarChart2, label: t('dashboard_stat_total'), value: stats ? String(stats.total) : '—', tone: 'text-ink-100' },
    { icon: CheckCircle2, label: t('dashboard_stat_supported'), value: stats ? String(stats.supported) : '—', tone: 'text-success-400' },
    { icon: XCircle, label: t('dashboard_stat_contradicted'), value: stats ? String(stats.contradicted) : '—', tone: 'text-error-400' },
    { icon: Gauge, label: t('dashboard_stat_avg_confidence'), value: stats ? formatPercent(stats.avgConfidence) : '—', tone: 'text-accent-300' },
  ];

  return (
    <div className="section-pad">
      <div className="container-app">
        <h1 className="text-3xl font-display font-bold text-gradient">
          {t('dashboard_welcome')}{profile?.display_name ? `, ${profile.display_name}` : ''}
        </h1>
        <p className="mt-2 text-ink-400">{t('dashboard_title')}</p>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="glass-card p-5">
              <c.icon className={`w-5 h-5 ${c.tone}`} />
              <div className={`mt-3 text-3xl font-display font-semibold ${c.tone}`}>{c.value}</div>
              <div className="text-xs text-ink-400 mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-semibold text-ink-100">{t('dashboard_recent')}</h2>
            <button onClick={() => navigate('/verify')} className="btn-outline text-sm px-3 py-2">
              <Plus className="w-4 h-4" />
              {t('dashboard_start')}
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <p className="text-ink-400">{t('dashboard_no_reports')}</p>
              <button onClick={() => navigate('/verify')} className="btn-primary mt-4">
                {t('dashboard_start')}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(routeToPath({ name: 'results', id: r.id }))}
                  className="glass-card-hover w-full text-start p-5 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-100 truncate">{r.input_title ?? t('report_title_default')}</p>
                    <p className="text-xs text-ink-500 mt-1">{formatDate(r.created_at)} · {r.total_claims} {t('results_total_claims').toLowerCase()}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.supported_count > 0 && (
                      <span className="badge bg-success-500/10 text-success-400">{r.supported_count} ✓</span>
                    )}
                    {r.contradicted_count > 0 && (
                      <span className="badge bg-error-500/10 text-error-400">{r.contradicted_count} ✗</span>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
