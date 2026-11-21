import { useEffect, useState } from 'react';
import { Save, Check, LogOut, Globe, Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { languageNames } from '@/i18n/translations';
import type { LanguageCode } from '@/types';

export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { navigate } = useRouter();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [notifications, setNotifications] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedPrefs, setLoadedPrefs] = useState(false);

  useEffect(() => {
    if (profile) setDisplayName(profile.display_name ?? '');
  }, [profile]);

  useEffect(() => {
    if (!user || loadedPrefs) return;
    supabase
      .from('user_preferences')
      .select('language, email_notifications')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLang(data.language as LanguageCode);
          setNotifications(data.email_notifications);
        }
        setLoadedPrefs(true);
      });
  }, [user, loadedPrefs, setLang]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id);
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('user_preferences')
          .update({ language: lang, email_notifications: notifications, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_preferences')
          .insert({ user_id: user.id, language: lang, email_notifications: notifications });
      }
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // keep form state on failure
    }
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="section-pad">
        <div className="container-app max-w-lg text-center">
          <div className="glass-card p-10">
            <h1 className="text-2xl font-display font-bold text-gradient">{t('settings_title')}</h1>
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

  return (
    <div className="section-pad">
      <div className="container-app max-w-2xl">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('settings_title')}</h1>
        <p className="mt-2 text-ink-400">{t('settings_subtitle')}</p>

        <div className="glass-card p-6 md:p-8 mt-8">
          <h2 className="text-lg font-display font-semibold text-ink-100">{t('settings_profile')}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="label-field" htmlFor="settings-email">{t('auth_email')}</label>
              <input id="settings-email" className="input-field opacity-60" value={user.email ?? ''} disabled />
            </div>
            <div>
              <label className="label-field" htmlFor="settings-name">{t('settings_display_name')}</label>
              <input
                id="settings-name"
                className="input-field"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 mt-4">
          <h2 className="text-lg font-display font-semibold text-ink-100">{t('settings_preferences')}</h2>
          <div className="mt-4 space-y-5">
            <div>
              <label className="label-field flex items-center gap-2" htmlFor="settings-lang">
                <Globe className="w-4 h-4 text-ink-400" />
                {t('settings_language')}
              </label>
              <select
                id="settings-lang"
                className="input-field"
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageCode)}
              >
                {(Object.keys(languageNames) as LanguageCode[]).map((l) => (
                  <option key={l} value={l} className="bg-ink-900">{languageNames[l]}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-ink-200">
                  <Bell className="w-4 h-4 text-ink-400" />
                  {t('settings_notifications')}
                </div>
                <p className="text-xs text-ink-500 mt-0.5">{t('settings_notifications_desc')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notifications}
                onClick={() => setNotifications((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                  notifications ? 'bg-accent-500' : 'bg-ink-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    notifications ? 'translate-x-[22px]' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? t('settings_saved') : t('settings_save')}
          </button>
          <button onClick={signOut} className="btn-secondary text-error-400 hover:bg-error-500/10">
            <LogOut className="w-4 h-4" />
            {t('settings_danger_signout')}
          </button>
        </div>
      </div>
    </div>
  );
}
