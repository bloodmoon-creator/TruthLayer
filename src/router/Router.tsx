import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'verify' }
  | { name: 'media' }
  | { name: 'media-results'; id: string }
  | { name: 'results'; id: string }
  | { name: 'dashboard' }
  | { name: 'history' }
  | { name: 'report'; id: string }
  | { name: 'settings' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'about' }
  | { name: 'methodology' }
  | { name: 'privacy' }
  | { name: 'terms' }
  | { name: 'notfound' };

interface RouterContextValue {
  route: Route;
  navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function parsePath(path: string): Route {
  const clean = path.replace(/^#\/?/, '').replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);

  if (parts.length === 0) return { name: 'home' };
  switch (parts[0]) {
    case 'verify': return { name: 'verify' };
    case 'media': return { name: 'media' };
    case 'media-results': return parts[1] ? { name: 'media-results', id: parts[1] } : { name: 'notfound' };
    case 'results': return parts[1] ? { name: 'results', id: parts[1] } : { name: 'notfound' };
    case 'report': return parts[1] ? { name: 'report', id: parts[1] } : { name: 'notfound' };
    case 'dashboard': return { name: 'dashboard' };
    case 'history': return { name: 'history' };
    case 'settings': return { name: 'settings' };
    case 'login': return { name: 'login' };
    case 'register': return { name: 'register' };
    case 'about': return { name: 'about' };
    case 'methodology': return { name: 'methodology' };
    case 'privacy': return { name: 'privacy' };
    case 'terms': return { name: 'terms' };
    default: return { name: 'notfound' };
  }
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'home': return '/';
    case 'verify': return '/verify';
    case 'media': return '/media';
    case 'media-results': return `/media-results/${route.id}`;
    case 'results': return `/results/${route.id}`;
    case 'report': return `/report/${route.id}`;
    case 'dashboard': return '/dashboard';
    case 'history': return '/history';
    case 'settings': return '/settings';
    case 'login': return '/login';
    case 'register': return '/register';
    case 'about': return '/about';
    case 'methodology': return '/methodology';
    case 'privacy': return '/privacy';
    case 'terms': return '/terms';
    default: return '/404';
  }
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parsePath(window.location.hash));
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '#/';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((path: string) => {
    const clean = path.startsWith('/') ? path : `/${path}`;
    window.location.hash = `#${clean}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <RouterContext.Provider value={{ route, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}
