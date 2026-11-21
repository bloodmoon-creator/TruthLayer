import { ShieldCheck, Search, Scale, FileBarChart2, ArrowRight, CheckCircle2, XCircle, AlertTriangle, HelpCircle, Type, Link2, Upload } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useRouter, routeToPath } from '@/router/Router';
import { useAuth } from '@/context/AuthContext';

export function HomePage() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const { user } = useAuth();

  const howSteps = [
    { icon: Search, titleKey: 'how_step1_title', descKey: 'how_step1_desc' },
    { icon: ShieldCheck, titleKey: 'how_step2_title', descKey: 'how_step2_desc' },
    { icon: Scale, titleKey: 'how_step3_title', descKey: 'how_step3_desc' },
    { icon: FileBarChart2, titleKey: 'how_step4_title', descKey: 'how_step4_desc' },
  ];

  const features = [
    { titleKey: 'features_extract', descKey: 'features_extract_desc' },
    { titleKey: 'features_evidence', descKey: 'features_evidence_desc' },
    { titleKey: 'features_traceable', descKey: 'features_traceable_desc' },
    { titleKey: 'features_multilingual', descKey: 'features_multilingual_desc' },
    { titleKey: 'features_guest', descKey: 'features_guest_desc' },
    { titleKey: 'features_confidence', descKey: 'features_confidence_desc' },
  ];

  const inputModes = [
    { icon: Type, titleKey: 'inputs_text', descKey: 'inputs_text_desc' },
    { icon: Link2, titleKey: 'inputs_url', descKey: 'inputs_url_desc' },
    { icon: Upload, titleKey: 'inputs_doc', descKey: 'inputs_doc_desc' },
  ];

  const exampleClaims = [
    { icon: CheckCircle2, tone: 'text-success-400', verdict: 'Supported', text: 'Drinking coffee in moderation is associated with a lower risk of several chronic diseases.' },
    { icon: XCircle, tone: 'text-error-400', verdict: 'Contradicted', text: 'Humans only use 10% of their brains.' },
    { icon: AlertTriangle, tone: 'text-warning-400', verdict: 'Partially supported', text: 'Electric vehicles have overtaken all combustion vehicles in global sales.' },
    { icon: HelpCircle, tone: 'text-ink-400', verdict: 'Insufficient evidence', text: 'A new treatment will reach hospitals within two years.' },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="section-pad pb-16">
        <div className="container-app">
          <div className="max-w-3xl mx-auto text-center">
            <span className="badge bg-accent-500/10 text-accent-300 border border-accent-500/20 mb-6">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t('tagline')}
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-gradient leading-tight">
              {t('hero_title')}
            </h1>
            <p className="mt-6 text-lg text-ink-300 leading-relaxed">{t('hero_subtitle')}</p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={() => navigate('/verify')} className="btn-primary text-base px-7 py-3.5 group">
                {t('hero_cta_verify')}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button onClick={() => navigate('/methodology')} className="btn-secondary text-base px-7 py-3.5">
                {t('hero_cta_learn')}
              </button>
            </div>
            {!user && (
              <p className="mt-4 text-sm text-ink-500">{t('features_guest_desc')}</p>
            )}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="section-pad py-16">
        <div className="container-app">
          <div className="glass-card p-8 md:p-12">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-ink-100 text-center">{t('problem_title')}</h2>
            <p className="mt-4 text-ink-300 text-center max-w-2xl mx-auto leading-relaxed">{t('problem_desc')}</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section-pad">
        <div className="container-app">
          <h2 className="text-3xl font-display font-bold text-ink-100 text-center">{t('how_title')}</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {howSteps.map((step, i) => (
              <div key={step.titleKey} className="glass-card-hover p-6 relative overflow-hidden">
                <span className="absolute -top-2 -end-2 text-7xl font-display font-bold text-white/[0.04] select-none">
                  {i + 1}
                </span>
                <step.icon className="w-8 h-8 text-accent-400" />
                <h3 className="mt-4 font-semibold text-ink-100">{t(step.titleKey as never)}</h3>
                <p className="mt-2 text-sm text-ink-400 leading-relaxed">{t(step.descKey as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Input modes */}
      <section className="section-pad">
        <div className="container-app">
          <h2 className="text-3xl font-display font-bold text-ink-100 text-center">{t('inputs_title')}</h2>
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {inputModes.map((mode) => (
              <div key={mode.titleKey} className="glass-card-hover p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center mx-auto">
                  <mode.icon className="w-6 h-6 text-accent-400" />
                </div>
                <h3 className="mt-4 font-semibold text-ink-100">{t(mode.titleKey as never)}</h3>
                <p className="mt-2 text-sm text-ink-400 leading-relaxed">{t(mode.descKey as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Example report */}
      <section className="section-pad">
        <div className="container-app">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-display font-bold text-ink-100">{t('example_title')}</h2>
            <p className="mt-3 text-ink-400">{t('example_subtitle')}</p>
          </div>
          <div className="mt-10 max-w-3xl mx-auto space-y-3">
            {exampleClaims.map((c) => (
              <div key={c.text} className="glass-card p-4 flex items-center gap-4">
                <c.icon className={`w-5 h-5 shrink-0 ${c.tone}`} />
                <p className="text-sm text-ink-200 flex-1">{c.text}</p>
                <span className="text-xs text-ink-500 shrink-0 hidden sm:block">{c.verdict}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section-pad">
        <div className="container-app">
          <h2 className="text-3xl font-display font-bold text-ink-100 text-center">{t('features_title')}</h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.titleKey} className="glass-card-hover p-6">
                <h3 className="font-semibold text-ink-100">{t(f.titleKey as never)}</h3>
                <p className="mt-2 text-sm text-ink-400 leading-relaxed">{t(f.descKey as never)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-pad pt-4">
        <div className="container-app">
          <div className="glass-card p-10 md:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-transparent pointer-events-none" />
            <h2 className="text-3xl font-display font-bold text-gradient relative">{t('cta_title')}</h2>
            <p className="mt-3 text-ink-300 relative">{t('cta_desc')}</p>
            <button onClick={() => navigate('/verify')} className="btn-primary text-base px-7 py-3.5 mt-8 relative">
              {t('cta_button')}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
