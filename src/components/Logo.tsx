import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter } from '@/router/Router';

export function Logo({ onClick }: { onClick?: () => void }) {
  const { t } = useI18n();
  const { navigate } = useRouter();

  return (
    <button
      onClick={onClick ?? (() => navigate('/'))}
      className="flex items-center gap-2.5 group focus:outline-none"
      aria-label={t('brand')}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-accent-500/30 blur-lg group-hover:bg-accent-500/50 transition-colors" />
        <div className="relative w-9 h-9 rounded-xl bg-ink-800 border border-white/10 flex items-center justify-center group-hover:border-accent-500/40 transition-colors">
          <ShieldCheck className="w-5 h-5 text-accent-400" strokeWidth={2.2} />
        </div>
      </div>
      <div className="text-left">
        <div className="font-display font-bold text-white text-lg leading-none tracking-tight">
          {t('brand')}
        </div>
        <div className="text-[10px] text-ink-400 leading-none mt-0.5 tracking-wide uppercase">
          Fact Verification
        </div>
      </div>
    </button>
  );
}
