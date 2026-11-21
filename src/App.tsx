import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { RouterProvider, useRouter } from '@/router/Router';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { I18nProvider } from '@/i18n/I18nProvider';
import { HomePage } from '@/pages/HomePage';
import { VerifyPage } from '@/pages/VerifyPage';
import { MediaWorkspacePage } from '@/pages/MediaWorkspacePage';
import { MediaResultsPage } from '@/pages/MediaResultsPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { AuthPage } from '@/pages/AuthPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AboutPage, MethodologyPage, PrivacyPage, TermsPage, NotFoundPage } from '@/pages/StaticPages';

function PageContent() {
  const { route } = useRouter();
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-accent-500/30 border-t-accent-400 rounded-full animate-spin" />
      </div>
    );
  }

  switch (route.name) {
    case 'home': return <HomePage />;
    case 'verify': return <VerifyPage />;
    case 'media': return <MediaWorkspacePage />;
    case 'media-results': return <MediaResultsPage id={route.id} />;
    case 'results': return <ResultsPage id={route.id} />;
    case 'dashboard': return <DashboardPage />;
    case 'history': return <HistoryPage />;
    case 'settings': return <SettingsPage />;
    case 'login': return <AuthPage mode="login" />;
    case 'register': return <AuthPage mode="register" />;
    case 'about': return <AboutPage />;
    case 'methodology': return <MethodologyPage />;
    case 'privacy': return <PrivacyPage />;
    case 'terms': return <TermsPage />;
    default: return <NotFoundPage />;
  }
}

function Shell() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PageContent />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <RouterProvider>
          <Shell />
        </RouterProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
