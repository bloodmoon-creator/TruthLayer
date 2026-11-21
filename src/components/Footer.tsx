import { Logo } from './Logo';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import type { Route } from '@/router/Router';

const columns: { titleKey: 'footer_product' | 'footer_company' | 'footer_legal'; links: { route: Route; labelKey: string }[] }[] = [
  {
    titleKey: 'footer_product',
    links: [
      { route: { name: 'verify' }, labelKey: 'nav_verify' },
      { route: { name: 'dashboard' }, labelKey: 'nav_dashboard' },
      { route: { name: 'history' }, labelKey: 'nav_history' },
    ],
  },
  {
    titleKey: 'footer_company',
    links: [
      { route: { name: 'about' }, labelKey: 'nav_about' },
      { route: { name: 'methodology' }, labelKey: 'nav_methodology' },
    ],
  },
  {
    titleKey: 'footer_legal',
    links: [
      { route: { name: 'privacy' }, labelKey: 'nav_privacy' },
      { route: { name: 'terms' }, labelKey: 'nav_terms' },
    ],
  },
];

export function Footer() {
  const { t } = useI18n();
  const { navigate } = useRouter();

  return (
    <footer className="border-t border-white/[0.06] bg-ink-950/60 mt-auto">
      <div className="container-app py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 text-sm text-ink-400 max-w-xs leading-relaxed">{t('tagline')}</p>
          </div>
          {columns.map((col) => (
            <div key={col.titleKey}>
              <h4 className="text-sm font-semibold text-ink-200 mb-3">{t(col.titleKey)}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.labelKey}>
                    <button
                      onClick={() => navigate(routeToPath(link.route))}
                      className="text-sm text-ink-400 hover:text-ink-100 transition-colors"
                    >
                      {t(link.labelKey as never)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-white/[0.06] text-sm text-ink-500">
          © {new Date().getFullYear()} TruthLayer. {t('footer_rights')}
        </div>
      </div>
    </footer>
  );
}
