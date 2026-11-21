import { useI18n } from '@/i18n/I18nProvider';

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-display font-semibold text-ink-100">{title}</h2>
      <p className="mt-3 text-sm text-ink-300 leading-relaxed">{body}</p>
    </div>
  );
}

export function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="section-pad">
      <div className="container-app max-w-3xl space-y-6">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('about_title')}</h1>
        <p className="text-lg text-ink-300 leading-relaxed">{t('about_hero')}</p>
        <Section title={t('about_mission_title')} body={t('about_mission_body')} />
        <Section title={t('about_principle_title')} body={t('about_principle_body')} />
        <Section title={t('about_methodology_title')} body={t('about_methodology_body')} />
      </div>
    </div>
  );
}

export function MethodologyPage() {
  const { t } = useI18n();
  return (
    <div className="section-pad">
      <div className="container-app max-w-3xl space-y-6">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('methodology_title')}</h1>
        <p className="text-ink-400">{t('methodology_intro')}</p>
        <Section title={t('methodology_extract_title')} body={t('methodology_extract_body')} />
        <Section title={t('methodology_search_title')} body={t('methodology_search_body')} />
        <Section title={t('methodology_analyze_title')} body={t('methodology_analyze_body')} />
        <Section title={t('methodology_assess_title')} body={t('methodology_assess_body')} />
        <Section title={t('methodology_confidence_title')} body={t('methodology_confidence_body')} />
        <Section title={t('methodology_limits_title')} body={t('methodology_limits_body')} />
      </div>
    </div>
  );
}

export function PrivacyPage() {
  const { t } = useI18n();
  return (
    <div className="section-pad">
      <div className="container-app max-w-3xl space-y-6">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('privacy_title')}</h1>
        <p className="text-sm text-ink-500">{t('privacy_updated')}</p>
        <p className="text-ink-300">{t('privacy_intro')}</p>
        <Section title={t('privacy_data_title')} body={t('privacy_data_body')} />
        <Section title={t('privacy_ai_title')} body={t('privacy_ai_body')} />
        <Section title={t('privacy_security_title')} body={t('privacy_security_body')} />
        <Section title={t('privacy_delete_title')} body={t('privacy_delete_body')} />
      </div>
    </div>
  );
}

export function TermsPage() {
  const { t } = useI18n();
  return (
    <div className="section-pad">
      <div className="container-app max-w-3xl space-y-6">
        <h1 className="text-3xl font-display font-bold text-gradient">{t('terms_title')}</h1>
        <p className="text-sm text-ink-500">{t('terms_updated')}</p>
        <p className="text-ink-300">{t('terms_intro')}</p>
        <Section title={t('terms_use_title')} body={t('terms_use_body')} />
        <Section title={t('terms_accuracy_title')} body={t('terms_accuracy_body')} />
        <Section title={t('terms_liability_title')} body={t('terms_liability_body')} />
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="section-pad">
      <div className="container-app max-w-lg text-center">
        <div className="glass-card p-12">
          <div className="text-6xl font-display font-bold text-gradient">404</div>
          <h1 className="mt-4 text-xl font-display font-semibold text-ink-100">{t('not_found_title')}</h1>
          <p className="mt-2 text-ink-400">{t('not_found_desc')}</p>
          <a href="#/" className="btn-primary mt-6 inline-flex">{t('back_home')}</a>
        </div>
      </div>
    </div>
  );
}
