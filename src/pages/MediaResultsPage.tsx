import { useState, useMemo } from 'react';
import {
  ArrowLeft, Save, Check, LogIn, RefreshCw, Download,
  FileImage, FileVideo, ExternalLink, ShieldCheck, AlertTriangle,
  XCircle, HelpCircle, Sparkles, Eye, Film, AudioLines, History,
  BadgeCheck, Maximize, Layers, MapPin, Globe,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { saveGuestMediaToUser } from '@/lib/mediaApi';
import { useMediaPolling } from './useMediaPolling';
import {
  classificationMeta, methodMeta, resultTypeMeta, stanceMeta,
  confidenceLabel, formatPercent, formatDate, formatDuration,
  formatTimestamp, formatBytes,
} from '@/lib/mediaAssessment';
import type { MediaMethod, MediaClassification, MediaFinding } from '@/types';

const methodIcons: Record<MediaMethod, typeof FileImage> = {
  metadata: FileImage,
  exif: MapPin,
  c2pa: BadgeCheck,
  dimensions: Maximize,
  compression: Layers,
  visual_inconsistency: Eye,
  ai_detection: Sparkles,
  temporal_consistency: Film,
  av_sync: AudioLines,
  provenance: History,
  source_search: Globe,
};

const classificationIcon: Record<MediaClassification, typeof ShieldCheck> = {
  likely_authentic: ShieldCheck,
  likely_ai_generated: Sparkles,
  likely_manipulated: AlertTriangle,
  misleading_context: HelpCircle,
  inconclusive: XCircle,
};

const classificationKey: Record<MediaClassification, string> = {
  likely_authentic: 'class_likely_authentic',
  likely_ai_generated: 'class_likely_ai_generated',
  likely_manipulated: 'class_likely_manipulated',
  misleading_context: 'class_misleading_context',
  inconclusive: 'class_inconclusive',
};

function FindingCard({ finding }: { finding: MediaFinding }) {
  const { t } = useI18n();
  const Icon = methodIcons[finding.method] ?? FileImage;
  const rMeta = resultTypeMeta[finding.result_type];
  const sMeta = stanceMeta[finding.stance];

  return (
    <div className="glass-card p-4 border border-white/[0.06]">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-ink-800 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-accent-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-100">{finding.label}</span>
            <span className={`badge ${rMeta.bg} ${rMeta.color}`}>
              {finding.result_type === 'signal' ? t('media_signals') :
               finding.result_type === 'observation' ? t('media_detail') :
               finding.result_type === 'limitation' ? t('media_limitations') :
               t('media_unavailable')}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-ink-300 leading-relaxed">{finding.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-ink-500">{t('media_method')}: {methodMeta[finding.method]?.label ?? finding.method}</span>
            {finding.stance !== 'neutral' && (
              <span className={sMeta.color}>{sMeta.label}</span>
            )}
            {finding.confidence > 0 && (
              <span className="text-ink-500">
                {t('media_confidence')}: <span className={sMeta.color}>{formatPercent(finding.confidence)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function downloadReport(investigationId: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `truthlayer-media-report-${investigationId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MediaResultsPage({ id }: { id: string }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { user } = useAuth();
  const { investigation, loading, notFound } = useMediaPolling(id);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(0);

  const processing = investigation?.status === 'pending' || investigation?.status === 'processing';

  const findingsByStance = useMemo(() => {
    if (!investigation) return { supporting: [], contradicting: [], limitations: [], unavailable: [] };
    const groups = { supporting: [] as MediaFinding[], contradicting: [] as MediaFinding[], limitations: [] as MediaFinding[], unavailable: [] as MediaFinding[] };
    for (const f of investigation.findings) {
      if (f.result_type === 'limitation') groups.limitations.push(f);
      else if (f.result_type === 'unavailable') groups.unavailable.push(f);
      else if (f.stance === 'supports_authentic') groups.supporting.push(f);
      else if (f.stance === 'supports_ai' || f.stance === 'supports_manipulation' || f.stance === 'supports_misleading') groups.contradicting.push(f);
      else if (f.stance === 'neutral' && f.result_type === 'observation') groups.supporting.push(f);
    }
    return groups;
  }, [investigation]);

  const handleSave = async () => {
    if (!investigation) return;
    setSaving(true);
    try {
      await saveGuestMediaToUser(investigation.id);
      setSaved(true);
    } catch {
      setSaved(false);
    }
    setSaving(false);
  };

  const handleDownload = () => {
    if (!investigation) return;
    downloadReport(investigation.id, JSON.stringify(investigation, null, 2));
  };

  if (loading) {
    return (
      <div className="section-pad">
        <div className="container-app max-w-4xl">
          <div className="glass-card p-10 text-center">
            <RefreshCw className="w-8 h-8 text-accent-400 mx-auto animate-spin" />
            <p className="mt-4 text-ink-400">{t('media_loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="section-pad">
        <div className="container-app max-w-4xl">
          <div className="glass-card p-10 text-center text-ink-300">{t('media_not_found')}</div>
        </div>
      </div>
    );
  }

  if (!investigation) return null;

  const mediaIcon = investigation.media_type === 'image' ? FileImage : FileVideo;
  const MediaIcon = mediaIcon;
  const classification = investigation.final_classification;
  const classMeta = classification ? classificationMeta[classification] : null;
  const ClassIcon = classification ? classificationIcon[classification] : HelpCircle;
  const classLabel = classification ? t(classificationKey[classification] as never) : '—';

  const frames = investigation.frames;
  const currentFrame = frames[selectedFrame];

  return (
    <div className="section-pad">
      <div className="container-app max-w-5xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-gradient truncate">
              {t('media_results_title')}
            </h1>
            <p className="text-sm text-ink-500 mt-1 truncate">
              {investigation.file_name ?? investigation.source_url ?? investigation.media_url ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigate('/media')} className="btn-ghost text-sm">
              <ArrowLeft className="w-4 h-4" />
              {t('media_back')}
            </button>
            <button onClick={() => navigate('/media')} className="btn-secondary text-sm">
              {t('media_new')}
            </button>
          </div>
        </div>

        {/* Processing state */}
        {processing && (
          <div className="glass-card p-8 mb-6">
            <div className="flex items-center justify-between text-sm text-ink-300">
              <span>{t('media_processing')}</span>
              <RefreshCw className="w-4 h-4 animate-spin text-accent-400" />
            </div>
            <div className="mt-3 h-1.5 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-accent-500 rounded-full animate-shimmer bg-[length:400px_100%]" />
            </div>
          </div>
        )}

        {/* Save banner for guests */}
        {!processing && !user && (
          <div className="glass-card p-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-accent-500/20">
            <p className="text-sm text-ink-300 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-accent-400 shrink-0" />
              {t('media_save_hint')}
            </p>
            <div className="flex gap-2">
              {saved ? (
                <span className="badge bg-success-500/10 text-success-400 border border-success-500/30 px-3 py-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {t('media_saved')}
                </span>
              ) : (
                <>
                  <button onClick={() => navigate('/login')} className="btn-secondary text-sm px-3 py-2">
                    {t('nav_login')}
                  </button>
                  <button onClick={handleSave} className="btn-primary text-sm px-3 py-2" disabled={saving}>
                    <Save className="w-3.5 h-3.5" />
                    {t('media_save')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {investigation.status === 'failed' && (
          <div className="glass-card p-10 text-center border-error-500/30 mb-6">
            <XCircle className="w-10 h-10 text-error-400 mx-auto" />
            <p className="mt-4 text-ink-200">{t('media_failed')}</p>
            {investigation.error_message && <p className="mt-2 text-sm text-ink-500">{investigation.error_message}</p>}
          </div>
        )}

        {investigation.status === 'completed' && (
          <>
            {/* Media preview + classification */}
            <div className="grid lg:grid-cols-3 gap-4 mb-6">
              <div className="glass-card p-5 lg:col-span-2">
                <div className="flex items-center gap-2 mb-3">
                  <MediaIcon className="w-5 h-5 text-accent-400" />
                  <span className="text-sm font-medium text-ink-200">{t('media_preview')}</span>
                </div>
                {investigation.media_url && investigation.media_type === 'image' && (
                  <img
                    src={investigation.media_url}
                    alt={investigation.file_name ?? 'Media'}
                    className="w-full max-h-80 object-contain rounded-xl border border-white/[0.06] bg-ink-950/60"
                  />
                )}
                {investigation.media_url && investigation.media_type === 'video' && (
                  <video
                    src={investigation.media_url}
                    controls
                    className="w-full max-h-80 object-contain rounded-xl border border-white/[0.06] bg-ink-950/60"
                  />
                )}
                {!investigation.media_url && (
                  <div className="w-full h-48 rounded-xl bg-ink-950/60 flex items-center justify-center text-ink-500">
                    {t('media_no_preview')}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {classMeta && classification && (
                  <div className={`glass-card p-5 border ${classMeta.border}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <ClassIcon className={`w-5 h-5 ${classMeta.color}`} />
                      <span className="text-xs uppercase tracking-wide text-ink-500">{t('media_classification')}</span>
                    </div>
                    <div className={`text-xl font-display font-semibold ${classMeta.color}`}>{classLabel}</div>
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="text-ink-500">{t('media_confidence')}:</span>
                      <div className="w-24 h-1.5 bg-ink-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            confidenceLabel(investigation.overall_confidence) === 'high'
                              ? 'bg-success-500'
                              : confidenceLabel(investigation.overall_confidence) === 'medium'
                              ? 'bg-warning-500'
                              : 'bg-error-500'
                          }`}
                          style={{ width: `${Math.round((investigation.overall_confidence ?? 0) * 100)}%` }}
                        />
                      </div>
                      <span className="text-ink-300">{formatPercent(investigation.overall_confidence)}</span>
                    </div>
                  </div>
                )}

                <div className="glass-card p-5">
                  <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-2">{t('media_metadata')}</h4>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-500 shrink-0">{t('media_dimensions')}</dt>
                      <dd className="text-ink-200">{investigation.width && investigation.height ? `${investigation.width}×${investigation.height}` : '—'}</dd>
                    </div>
                    {investigation.duration_seconds != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-ink-500 shrink-0">{t('media_duration')}</dt>
                        <dd className="text-ink-200">{formatDuration(investigation.duration_seconds)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-500 shrink-0">{t('media_file_size')}</dt>
                      <dd className="text-ink-200">{formatBytes(investigation.file_size_bytes)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-500 shrink-0">{t('media_mime_type')}</dt>
                      <dd className="text-ink-200 truncate">{investigation.mime_type ?? '—'}</dd>
                    </div>
                  </dl>
                </div>

                <button onClick={handleDownload} className="btn-secondary w-full text-sm py-2.5">
                  <Download className="w-4 h-4" />
                  {t('media_download')}
                </button>
              </div>
            </div>

            {/* Summary */}
            {investigation.overall_summary && (
              <div className="glass-card p-6 mb-6">
                <h3 className="text-sm font-semibold text-ink-200 mb-2">{t('media_summary')}</h3>
                <p className="text-sm text-ink-300 leading-relaxed">{investigation.overall_summary}</p>
              </div>
            )}

            {/* Signals summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-display font-semibold text-success-400">{findingsByStance.supporting.length}</div>
                <div className="text-xs text-ink-400 mt-1">{t('media_supporting')}</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-display font-semibold text-error-400">{findingsByStance.contradicting.length}</div>
                <div className="text-xs text-ink-400 mt-1">{t('media_contradicting')}</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-display font-semibold text-warning-400">{findingsByStance.limitations.length}</div>
                <div className="text-xs text-ink-400 mt-1">{t('media_limitations')}</div>
              </div>
              <div className="glass-card p-4 text-center">
                <div className="text-2xl font-display font-semibold text-ink-400">{findingsByStance.unavailable.length}</div>
                <div className="text-xs text-ink-400 mt-1">{t('media_unavailable')}</div>
              </div>
            </div>

            {/* Frame inspection (video) */}
            {investigation.media_type === 'video' && frames.length > 0 && (
              <div className="glass-card p-6 mb-6">
                <h3 className="text-lg font-display font-semibold text-ink-100 mb-4">{t('media_frames')}</h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <div className="rounded-xl bg-ink-950/60 border border-white/[0.06] overflow-hidden">
                      {currentFrame && (
                        <>
                          <img src={currentFrame.public_url} alt={`Frame ${selectedFrame + 1}`} className="w-full object-contain max-h-64" />
                          <div className="p-2 text-xs text-ink-400 flex justify-between">
                            <span>{t('media_frame')} {selectedFrame + 1} / {frames.length}</span>
                            <span>{formatTimestamp(currentFrame.timestamp_seconds)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    {frames.map((frame, i) => (
                      <button
                        key={frame.id}
                        onClick={() => setSelectedFrame(i)}
                        className={`w-full flex items-center gap-3 rounded-xl p-2.5 text-start transition-colors ${
                          i === selectedFrame ? 'bg-accent-500/10 border border-accent-500/30' : 'bg-ink-950/40 border border-transparent hover:bg-white/5'
                        }`}
                      >
                        <img src={frame.public_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink-200">{t('media_frame')} {i + 1}</p>
                          <p className="text-xs text-ink-500">{formatTimestamp(frame.timestamp_seconds)}{frame.is_representative ? ` · ${t('media_representative')}` : ''}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Findings */}
            <div className="mb-6">
              <h3 className="text-lg font-display font-semibold text-ink-100 mb-3">{t('media_findings')}</h3>
              {investigation.findings.length === 0 ? (
                <div className="glass-card p-8 text-center text-ink-400">{t('media_no_findings')}</div>
              ) : (
                <div className="space-y-3">
                  {investigation.findings.map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </div>
              )}
            </div>

            {/* Source investigation */}
            {investigation.evidence.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-display font-semibold text-ink-100 mb-3">{t('media_evidence')}</h3>
                <div className="space-y-2">
                  {investigation.evidence.map((ev) => (
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
                        <ExternalLink className="w-3.5 h-3.5 text-ink-500 shrink-0" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
