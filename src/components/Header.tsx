import { useState, useEffect } from 'react';
import { Menu, X, Globe } from 'lucide-react';
import { Logo } from './Logo';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath, type Route } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';
import { translations, languageNames } from '@/i18n/translations';
import type { LanguageCode } from '@/types';

const navItems: { route: Route; labelKey: 'nav_home' | 'nav_verify' | 'nav_media' | 'nav_dashboard' | 'nav_history' | 'nav_about' | 'nav_methodology' }[] = [
  { route: { name: 'home' }, labelKey: 'nav_home' },
  { route: { name: 'verify' }, labelKey: 'nav_verify' },
  { route: { name: 'media' }, labelKey: 'nav_media' },
  { route: { name: 'dashboard' }, labelKey: 'nav_dashboard' },
  { route: { name: 'history' }, labelKey: 'nav_history' },
  { route: { name: 'about' }, labelKey: 'nav_about' },
  { route: { name: 'methodology' }, labelKey: 'nav_methodology' },
];

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { route, navigate } = useRouter();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setLangOpen(false);
  }, [route]);

  const isActive = (r: Route) => route.name === r.name;
  const languages = Object.keys(languageNames) as LanguageCode[];

  const handleNav = (r: Route) => navigate(routeToPath(r));

  return (
    <header className="sticky top-0 z-50 bg-ink-950/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="container-app">
        <div className="flex items-center justify-between h-16">
          <Logo />

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.labelKey}
                onClick={() => handleNav(item.route)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.route)
                    ? 'text-white bg-white/5'
                    : 'text-ink-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <button
                onClick={() => setLangOpen((v) => !v)}
                className="btn-ghost px-2.5"
                aria-label={t('settings_language')}
              >
                <Globe className="w-4 h-4" />
                <span className="text-sm">{languageNames[lang]}</span>
              </button>
              {langOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                  <div className="absolute end-0 mt-2 w-44 glass-card p-1 z-20 animate-fade-in">
                    {languages.map((l) => (
                      <button
                        key={l}
                        onClick={() => { setLang(l); setLangOpen(false); }}
                        className={`w-full text-start px-3 py-2 rounded-lg text-sm transition-colors ${
                          lang === l ? 'bg-accent-500/15 text-accent-300' : 'text-ink-200 hover:bg-white/5'
                        }`}
                      >
                        {languageNames[l]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {user ? (
              <div className="hidden sm:flex items-center gap-2">
                <button onClick={() => handleNav({ name: 'settings' })} className="btn-ghost">
                  <span className="w-7 h-7 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-xs font-semibold">
                    {user.email?.[0]?.toUpperCase() ?? 'U'}
                  </span>
                </button>
                <button onClick={signOut} className="btn-secondary text-sm px-3 py-2">
                  {t('nav_logout')}
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <button onClick={() => handleNav({ name: 'login' })} className="btn-ghost text-sm">
                  {t('nav_login')}
                </button>
                <button onClick={() => handleNav({ name: 'register' })} className="btn-primary text-sm px-4 py-2">
                  {t('nav_register')}
                </button>
              </div>
            )}

            <button
              className="lg:hidden btn-ghost px-2"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-white/[0.06] bg-ink-950/95 backdrop-blur-xl animate-fade-in">
          <div className="container-app py-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.labelKey}
                onClick={() => handleNav(item.route)}
                className={`w-full text-start px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.route) ? 'text-white bg-white/5' : 'text-ink-300 hover:bg-white/5'
                }`}
              >
                {t(item.labelKey)}
              </button>
            ))}
            <div className="pt-2 mt-2 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-ink-400" />
                <span className="text-xs text-ink-400 uppercase tracking-wide">{t('settings_language')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {languages.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      lang === l ? 'bg-accent-500/15 text-accent-300' : 'bg-ink-800 text-ink-300'
                    }`}
                  >
                    {languageNames[l]}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-white/5">
              {user ? (
                <div className="flex gap-2">
                  <button onClick={() => handleNav({ name: 'settings' })} className="btn-secondary flex-1 text-sm">
                    {t('nav_settings')}
                  </button>
                  <button onClick={signOut} className="btn-secondary flex-1 text-sm">
                    {t('nav_logout')}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => handleNav({ name: 'login' })} className="btn-secondary flex-1 text-sm">
                    {t('nav_login')}
                  </button>
                  <button onClick={() => handleNav({ name: 'register' })} className="btn-primary flex-1 text-sm">
                    {t('nav_register')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
