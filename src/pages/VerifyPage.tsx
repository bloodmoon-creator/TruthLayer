import { useState, useRef } from 'react';
import { Type, Link2, Upload, FileText, X, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { submitVerification, validateSubmission, type VerificationSubmission } from '@/lib/verification';
import type { LanguageCode } from '@/types';

type Tab = 'text' | 'url' | 'document';

const tabs: { key: Tab; icon: typeof Type; labelKey: 'tab_text' | 'tab_url' | 'tab_doc' }[] = [
  { key: 'text', icon: Type, labelKey: 'tab_text' },
  { key: 'url', icon: Link2, labelKey: 'tab_url' },
  { key: 'document', icon: Upload, labelKey: 'tab_doc' },
];

const languages: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'hi', label: 'हिन्दी' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

async function extractTxt(file: File): Promise<string> {
  return file.text();
}

export function VerifyPage() {
  const { t, lang } = useI18n();
  const { navigate } = useRouter();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [reportLang, setReportLang] = useState<LanguageCode>(lang);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setError(null);
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.pdf')) {
      setError(t('error_file_type'));
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError(t('error_file_size'));
      return;
    }
    let content: string | null = null;
    if (lower.endsWith('.txt')) {
      try {
        content = await extractTxt(f);
      } catch {
        content = null;
      }
    }
    setFile(f);
    setFileContent(content);
  };

  const clearFile = () => {
    setFile(null);
    setFileContent(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    setError(null);
    const sub: VerificationSubmission = {
      inputType: tab,
      text: tab === 'text' ? text : undefined,
      url: tab === 'url' ? url : undefined,
      fileName: tab === 'document' ? file?.name : undefined,
      fileContent: tab === 'document' ? fileContent ?? undefined : undefined,
      language: reportLang,
    };

    const validationError = validateSubmission(sub);
    if (validationError) {
      setError(t(validationError as never));
      return;
    }

    setSubmitting(true);
    try {
      const reportId = await submitVerification(sub);
      navigate(routeToPath({ name: 'results', id: reportId }));
    } catch {
      setError(t('error_generic'));
      setSubmitting(false);
    }
  };

  const charCount = text.length;

  return (
    <div className="section-pad">
      <div className="container-app max-w-3xl">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('workspace_title')}</h1>
        <p className="mt-2 text-ink-400">{t('workspace_subtitle')}</p>

        {!user && (
          <div className="mt-4 badge bg-accent-500/10 text-accent-300 border border-accent-500/20 px-3 py-1.5">
            {t('auth_guest_notice')}
          </div>
        )}

        <div className="glass-card p-6 md:p-8 mt-6">
          {/* Tabs */}
          <div className="flex gap-2 p-1 bg-ink-950/60 rounded-xl border border-white/[0.06]">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => { setTab(tb.key); setError(null); }}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === tb.key ? 'bg-accent-500/15 text-accent-300' : 'text-ink-400 hover:text-ink-200 hover:bg-white/5'
                }`}
              >
                <tb.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t(tb.labelKey)}</span>
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === 'text' && (
              <div>
                <label className="label-field" htmlFor="verify-text">{t('text_label')}</label>
                <textarea
                  id="verify-text"
                  className="input-field min-h-[220px] resize-y leading-relaxed"
                  placeholder={t('text_placeholder')}
                  value={text}
                  maxLength={15000}
                  onChange={(e) => setText(e.target.value)}
                  disabled={submitting}
                />
                <div className="mt-1.5 flex justify-between text-xs text-ink-500">
                  <span>{charCount < 50 ? t('text_min') : ''}</span>
                  <span>{charCount.toLocaleString()} / 15,000</span>
                </div>
              </div>
            )}

            {tab === 'url' && (
              <div>
                <label className="label-field" htmlFor="verify-url">{t('url_label')}</label>
                <input
                  id="verify-url"
                  type="url"
                  className="input-field"
                  placeholder={t('url_placeholder')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={submitting}
                />
                <p className="mt-1.5 text-xs text-ink-500">{t('url_hint')}</p>
              </div>
            )}

            {tab === 'document' && (
              <div>
                <label className="label-field">{t('doc_label')}</label>
                {!file ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-white/10 rounded-xl p-10 text-center hover:border-accent-500/40 hover:bg-accent-500/5 transition-colors"
                    disabled={submitting}
                  >
                    <Upload className="w-8 h-8 text-ink-500 mx-auto" />
                    <p className="mt-3 text-sm text-ink-300">{t('doc_drop')}</p>
                    <p className="mt-1 text-xs text-ink-500">{t('doc_hint')}</p>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl bg-ink-950/60 border border-white/10 p-4">
                    <FileText className="w-5 h-5 text-accent-400 shrink-0" />
                    <span className="text-sm text-ink-200 truncate flex-1">{file.name}</span>
                    <button onClick={clearFile} className="btn-ghost px-2 py-1 text-xs" disabled={submitting}>
                      <X className="w-3.5 h-3.5" />
                      {t('doc_remove')}
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="label-field" htmlFor="verify-lang">{t('language_label')}</label>
            <select
              id="verify-lang"
              className="input-field"
              value={reportLang}
              onChange={(e) => setReportLang(e.target.value as LanguageCode)}
              disabled={submitting}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code} className="bg-ink-900">
                  {l.label}
                </option>
              ))}
            </select>
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
                {t('submitting')}
              </>
            ) : (
              t('submit_verify')
            )}
          </button>

          {submitting && (
            <p className="mt-3 text-center text-sm text-ink-400 animate-fade-in">{t('submit_processing')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
