import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { I18nProvider, LOCALES, DEFAULT_LOCALE, useI18n } from '@/i18n/I18nContext';
import type { Locale } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { usePlatformConfig } from '@/context/PlatformConfigContext';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Spinner } from '@/components/ui';
const Landing = lazy(() => import('@/routes/Landing'));
const Play = lazy(() => import('@/routes/Play'));
const Lobby = lazy(() => import('@/routes/Lobby'));
const CreateRoom = lazy(() => import('@/routes/CreateRoom'));
const JoinRoom = lazy(() => import('@/routes/JoinRoom'));
const WaitingRoom = lazy(() => import('@/routes/WaitingRoom'));
const GameRoom = lazy(() => import('@/routes/GameRoom'));
const Results = lazy(() => import('@/routes/Results'));
const Leaderboard = lazy(() => import('@/routes/Leaderboard'));
const Blog = lazy(() => import('@/routes/Blog'));
const BlogArticle = lazy(() => import('@/routes/BlogArticle'));
const Rules = lazy(() => import('@/routes/Rules'));
const Legal = lazy(() => import('@/routes/Legal'));
const SignIn = lazy(() => import('@/routes/SignIn'));
const SignUp = lazy(() => import('@/routes/SignUp'));
const Profile = lazy(() => import('@/routes/Profile'));
const Achievements = lazy(() => import('@/routes/Achievements'));
const Challenges = lazy(() => import('@/routes/Challenges'));
const NotFound = lazy(() => import('@/routes/NotFound'));
const AdminApp = lazy(() => import('@/routes/admin/AdminApp'));

function LocaleLayout({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}

function MaintenanceScreen() {
  const { config } = usePlatformConfig();
  return (
    <div className="page container container-narrow" role="status">
      <h1>{config.siteName}</h1>
      <p className="muted">We are performing scheduled maintenance. Please check back shortly.</p>
    </div>
  );
}

function PublicLayout() {
  const { config } = usePlatformConfig();
  if (config.maintenance) return <MaintenanceScreen />;
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      {config.announcement && (
        <div role="status" style={{ background: 'var(--cyan, #06b6d4)', color: '#04252b', textAlign: 'center', padding: '8px 16px', fontSize: '14px', fontWeight: 600 }}>{config.announcement}</div>
      )}
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

// Wait for the session to resolve before gating, so a cold-loaded deep link
// (e.g. refreshing /room/CODE) is not bounced to /play while auth is loading.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const { path } = useI18n();
  if (!ready) return <div className="page"><Spinner /></div>;
  if (!user) return <Navigate to={path('/play')} replace />;
  return <>{children}</>;
}

// Static locale prefixes keep /:locale/<section> from outranking /admin/* for
// shared names like blog, achievements, and challenges.
const siteRoutes = (
  <>
    <Route element={<PublicLayout />}>
      <Route index element={<Landing />} />
      <Route path="play" element={<Play />} />
      <Route path="lobby" element={<RequireAuth><Lobby /></RequireAuth>} />
      <Route path="create" element={<RequireAuth><CreateRoom /></RequireAuth>} />
      <Route path="join" element={<RequireAuth><JoinRoom /></RequireAuth>} />
      <Route path="join/:code" element={<RequireAuth><JoinRoom /></RequireAuth>} />
      <Route path="room/:code" element={<RequireAuth><WaitingRoom /></RequireAuth>} />
      <Route path="results/:code" element={<RequireAuth><Results /></RequireAuth>} />
      <Route path="leaderboard" element={<Leaderboard />} />
      <Route path="blog" element={<Blog />} />
      <Route path="blog/:slug" element={<BlogArticle />} />
      <Route path="rules" element={<Rules />} />
      <Route path="terms" element={<Legal kind="terms" />} />
      <Route path="privacy" element={<Legal kind="privacy" />} />
      <Route path="sign-in" element={<SignIn />} />
      <Route path="sign-up" element={<SignUp />} />
      <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="achievements" element={<RequireAuth><Achievements /></RequireAuth>} />
      <Route path="challenges" element={<RequireAuth><Challenges /></RequireAuth>} />
      <Route path="*" element={<NotFound />} />
    </Route>
    <Route path="game/:code" element={<RequireAuth><GameRoom /></RequireAuth>} />
  </>
);

export default function App() {
  return (
    <Suspense fallback={<div className="page"><Spinner /></div>}>
    <Routes>
      <Route path="/" element={<Navigate to={`/${DEFAULT_LOCALE}`} replace />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<div className="page"><Spinner /></div>}>
            <AdminApp />
          </Suspense>
        }
      />
      {LOCALES.map((l) => (
        <Route key={l.code} path={l.code} element={<LocaleLayout locale={l.code} />}>
          {siteRoutes}
        </Route>
      ))}
      <Route path="*" element={<Navigate to={`/${DEFAULT_LOCALE}`} replace />} />
    </Routes>
    </Suspense>
  );
}
