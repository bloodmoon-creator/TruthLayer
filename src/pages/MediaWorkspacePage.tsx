import { useState, useRef, useCallback } from 'react';
import { ImageIcon, Video, Upload, Link2, X, FileVideo, FileImage, AlertCircle, ScanSearch } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { submitMediaInvestigation, validateMediaSubmission, type MediaSubmission } from '@/lib/mediaApi';
import type { MediaType } from '@/types';

type InputTab = 'upload' | 'url';

export function MediaWorkspacePage() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { user } = useAuth();

  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [inputTab, setInputTab] = useState<InputTab>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    const lower = f.name.toLowerCase();
    if (mediaType === 'image') {
      if (!['.jpg', '.jpeg', '.png', '.webp'].some((ext) => lower.endsWith(ext))) {
        setError(t('media_error_image_type'));
        return;
      }
      if (f.size > 10 * 1024 * 1024) {
        setError(t('media_error_image_size'));
        return;
      }
    } else {
      if (!['.mp4', '.mov', '.webm'].some((ext) => lower.endsWith(ext))) {
        setError(t('media_error_video_type'));
        return;
      }
      if (f.size > 50 * 1024 * 1024) {
        setError(t('media_error_video_size'));
        return;
      }
    }
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(mediaType === 'image' ? URL.createObjectURL(f) : null);
  }, [mediaType, t, previewUrl]);

  const clearFile = () => {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const switchMediaType = (type: MediaType) => {
    setMediaType(type);
    clearFile();
    setUrl('');
    setError(null);
  };

  const switchTab = (tab: InputTab) => {
    setInputTab(tab);
    clearFile();
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    const sub: MediaSubmission = {
      mediaType,
      inputMethod: inputTab,
      file: inputTab === 'upload' ? file ?? undefined : undefined,
      url: inputTab === 'url' ? url : undefined,
    };

    const validationError = validateMediaSubmission(sub);
    if (validationError) {
      setError(t(validationError as never));
      return;
    }

    setSubmitting(true);
    try {
      const id = await submitMediaInvestigation(sub);
      navigate(routeToPath({ name: 'media-results', id }));
    } catch {
      setError(t('media_error_generic'));
      setSubmitting(false);
    }
  };

  const acceptedExts = mediaType === 'image' ? '.jpg,.jpeg,.png,.webp' : '.mp4,.mov,.webm';
  const hintKey = mediaType === 'image' ? 'media_image_hint' : 'media_video_hint';

  return (
    <div className="section-pad">
      <div className="container-app max-w-3xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center">
            <ScanSearch className="w-5 h-5 text-accent-400" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-gradient">{t('media_workspace_title')}</h1>
            <p className="mt-1 text-sm text-ink-400">{t('media_workspace_subtitle')}</p>
          </div>
        </div>

        {!user && (
          <div className="mt-4 badge bg-accent-500/10 text-accent-300 border border-accent-500/20 px-3 py-1.5">
            {t('auth_guest_notice')}
          </div>
        )}

        <div className="glass-card p-6 md:p-8 mt-6">
          {/* Media type selector */}
          <div className="flex gap-2 p-1 bg-ink-950/60 rounded-xl border border-white/[0.06]">
            <button
              onClick={() => switchMediaType('image')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mediaType === 'image' ? 'bg-accent-500/15 text-accent-300' : 'text-ink-400 hover:text-ink-200 hover:bg-white/5'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              {t('media_tab_image')}
            </button>
            <button
              onClick={() => switchMediaType('video')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mediaType === 'video' ? 'bg-accent-500/15 text-accent-300' : 'text-ink-400 hover:text-ink-200 hover:bg-white/5'
              }`}
            >
              <Video className="w-4 h-4" />
              {t('media_tab_video')}
            </button>
          </div>

          {/* Input method tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => switchTab('upload')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                inputTab === 'upload' ? 'bg-ink-800 text-ink-100' : 'text-ink-400 hover:text-ink-200 hover:bg-white/5'
              }`}
            >
              <Upload className="w-4 h-4" />
              {t('media_tab_upload')}
            </button>
            <button
              onClick={() => switchTab('url')}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                inputTab === 'url' ? 'bg-ink-800 text-ink-100' : 'text-ink-400 hover:text-ink-200 hover:bg-white/5'
              }`}
            >
              <Link2 className="w-4 h-4" />
              {t('media_tab_url')}
            </button>
          </div>

          <div className="mt-6">
            {inputTab === 'upload' && (
              <div>
                {!file ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleFile(f);
                    }}
                    className={`w-full border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                      dragOver
                        ? 'border-accent-500/60 bg-accent-500/10'
                        : 'border-white/10 hover:border-accent-500/40 hover:bg-accent-500/5'
                    }`}
                    disabled={submitting}
                  >
                    {mediaType === 'image' ? (
                      <FileImage className="w-8 h-8 text-ink-500 mx-auto" />
                    ) : (
                      <FileVideo className="w-8 h-8 text-ink-500 mx-auto" />
                    )}
                    <p className="mt-3 text-sm text-ink-300">{t('media_drop')}</p>
                    <p className="mt-1 text-xs text-ink-500">{t(hintKey as never)}</p>
                  </button>
                ) : (
                  <div className="rounded-xl bg-ink-950/60 border border-white/10 p-4">
                    <div className="flex items-center gap-3">
                      {previewUrl && mediaType === 'image' ? (
                        <img src={previewUrl} alt={t('media_preview')} className="w-20 h-20 rounded-lg object-cover border border-white/10" />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-ink-800 flex items-center justify-center">
                          {mediaType === 'image' ? <FileImage className="w-8 h-8 text-ink-500" /> : <FileVideo className="w-8 h-8 text-ink-500" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink-200 truncate">{file.name}</p>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'unknown'}
                        </p>
                      </div>
                      <button onClick={clearFile} className="btn-ghost px-2 py-1 text-xs" disabled={submitting}>
                        <X className="w-3.5 h-3.5" />
                        {t('media_remove')}
                      </button>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedExts}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            )}

            {inputTab === 'url' && (
              <div>
                <label className="label-field" htmlFor="media-url">{t('media_url_label')}</label>
                <input
                  id="media-url"
                  type="url"
                  className="input-field"
                  placeholder={t('media_url_placeholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={submitting}
                />
                <p className="mt-1.5 text-xs text-ink-500">{t('media_url_hint')}</p>
                {url && mediaType === 'image' && (
                  <div className="mt-3 rounded-xl bg-ink-950/60 border border-white/10 p-4">
                    <img
                      src={url}
                      alt={t('media_preview')}
                      className="max-h-48 rounded-lg mx-auto object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                {url && mediaType === 'video' && (
                  <div className="mt-3 rounded-xl bg-ink-950/60 border border-white/10 p-4">
                    <video
                      src={url}
                      controls
                      className="max-h-48 rounded-lg mx-auto"
                      onError={(e) => { (e.target as HTMLVideoElement).style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-error-500/10 border border-error-500/30 px-4 py-3 text-sm text-error-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            className="btn-primary w-full mt-6 py-3.5 text-base"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('media_submitting')}
              </>
            ) : (
              <>
                <ScanSearch className="w-4 h-4" />
                {t('media_submit')}
              </>
            )}
          </button>

          {submitting && (
            <p className="mt-3 text-center text-sm text-ink-400 animate-fade-in">{t('media_processing')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
