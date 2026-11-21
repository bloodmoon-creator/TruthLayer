import { useState } from 'react';
import { ArrowLeft, Save, Check, LogIn, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { saveGuestReportToUser } from '@/lib/verification';
import { useReportPolling } from './useReportPolling';
import { ReportView } from '@/components/ReportView';

export function ResultsPage({ id }: { id: string }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { report, loading, notFound } = useReportPolling(id);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const processing = report?.status === 'pending' || report?.status === 'processing';

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await saveGuestReportToUser(report.id);
      setSaved(true);
    } catch {
      setSaved(false);
    }
    setSaving(false);
  };

  return (
    <div className="section-pad">
      <div className="container-app max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-gradient truncate">
              {report?.input_title ?? t('results_title')}
            </h1>
            <p className="text-sm text-ink-500 mt-1">{t('results_title')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigate('/verify')} className="btn-ghost text-sm">
              <ArrowLeft className="w-4 h-4" />
              {t('results_back')}
            </button>
            <button onClick={() => navigate('/verify')} className="btn-secondary text-sm">
              {t('results_new')}
            </button>
          </div>
        </div>

        {loading && (
          <div className="glass-card p-10 text-center">
            <RefreshCw className="w-8 h-8 text-accent-400 mx-auto animate-spin" />
            <p className="mt-4 text-ink-400">{t('report_loading')}</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="glass-card p-10 text-center text-ink-300">{t('report_not_found')}</div>
        )}

        {!loading && !notFound && report && (
          <>
            {processing && (
              <div className="glass-card p-8 mb-6">
                <div className="flex items-center justify-between text-sm text-ink-300">
                  <span>{t('submit_processing')}</span>
                  <RefreshCw className="w-4 h-4 animate-spin text-accent-400" />
                </div>
                <div className="mt-3 h-1.5 bg-ink-800 rounded-full overflow-hidden">
                  <div className="h-full w-1/3 bg-accent-500 rounded-full animate-shimmer bg-[length:400px_100%]" />
                </div>
              </div>
            )}

            {!processing && !user && (
              <div className="glass-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-accent-500/20">
                <p className="text-sm text-ink-300 flex items-center gap-2">
                  <LogIn className="w-4 h-4 text-accent-400 shrink-0" />
                  {t('results_save_hint')}
                </p>
                <div className="flex gap-2">
                  {saved ? (
                    <span className="badge bg-success-500/10 text-success-400 border border-success-500/30 px-3 py-1.5">
                      <Check className="w-3.5 h-3.5" />
                      {t('results_saved')}
                    </span>
                  ) : (
                    <>
                      <button onClick={() => navigate('/login')} className="btn-secondary text-sm px-3 py-2">
                        {t('nav_login')}
                      </button>
                      <button onClick={handleSave} className="btn-primary text-sm px-3 py-2" disabled={saving}>
                        <Save className="w-3.5 h-3.5" />
                        {t('results_save')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <ReportView report={report} />
          </>
        )}
      </div>
    </div>
  );
}
