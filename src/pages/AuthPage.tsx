import { useState } from 'react';
import { AlertCircle, LogIn, UserPlus, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter } from '@/router/Router';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLogin = mode === 'login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && password.length < 6) {
      setError(t('auth_error_weak'));
      return;
    }

    setBusy(true);
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(t('auth_error_invalid'));
          setBusy(false);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: name ? { display_name: name } : undefined },
        });
        if (err) {
          setError(err.message.includes('already') || err.message.includes('registered') ? t('auth_error_exists') : t('auth_error_generic'));
          setBusy(false);
          return;
        }
      }
      navigate('/');
    } catch {
      setError(t('auth_error_generic'));
      setBusy(false);
    }
  };

  return (
    <div className="section-pad">
      <div className="container-app max-w-md">
        <div className="glass-card p-8">
          <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center">
            {isLogin ? <LogIn className="w-6 h-6 text-accent-400" /> : <UserPlus className="w-6 h-6 text-accent-400" />}
          </div>
          <h1 className="mt-4 text-2xl font-display font-bold text-gradient">
            {isLogin ? t('auth_login_title') : t('auth_register_title')}
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            {isLogin ? t('auth_login_subtitle') : t('auth_register_subtitle')}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!isLogin && (
              <div>
                <label className="label-field" htmlFor="auth-name">{t('auth_name')}</label>
                <input
                  id="auth-name"
                  type="text"
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="label-field" htmlFor="auth-email">{t('auth_email')}</label>
              <input
                id="auth-email"
                type="email"
                required
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label-field" htmlFor="auth-password">{t('auth_password')}</label>
              <input
                id="auth-password"
                type="password"
                required
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-error-500/10 border border-error-500/30 px-4 py-3 text-sm text-error-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-3" disabled={busy}>
              {busy ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isLogin ? (
                <>
                  <UserCheck className="w-4 h-4" />
                  {t('auth_signin_btn')}
                </>
              ) : (
                t('auth_signup_btn')
              )}
            </button>
          </form>

          <button
            onClick={() => navigate(isLogin ? '/register' : '/login')}
            className="w-full mt-4 text-sm text-accent-300 hover:text-accent-200 transition-colors"
          >
            {isLogin ? t('auth_switch_to_register') : t('auth_switch_to_login')}
          </button>
        </div>
      </div>
    </div>
  );
}
