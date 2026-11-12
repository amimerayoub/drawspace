import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { I18nProvider, LOCALES, DEFAULT_LOCALE } from '@/i18n/I18nContext';
import type { Locale } from '@/types';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Spinner } from '@/components/ui';
import Landing from '@/routes/Landing';
import Play from '@/routes/Play';
import Lobby from '@/routes/Lobby';
import CreateRoom from '@/routes/CreateRoom';
import JoinRoom from '@/routes/JoinRoom';
import WaitingRoom from '@/routes/WaitingRoom';
import GameRoom from '@/routes/GameRoom';
import Results from '@/routes/Results';
import Leaderboard from '@/routes/Leaderboard';
import Blog from '@/routes/Blog';
import BlogArticle from '@/routes/BlogArticle';
import Rules from '@/routes/Rules';
import Legal from '@/routes/Legal';
import SignIn from '@/routes/SignIn';
import SignUp from '@/routes/SignUp';
import Profile from '@/routes/Profile';
import Achievements from '@/routes/Achievements';
import Challenges from '@/routes/Challenges';
import NotFound from '@/routes/NotFound';

const AdminApp = lazy(() => import('@/routes/admin/AdminApp'));

function LocaleLayout({ locale }: { locale: Locale }) {
  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}

function PublicLayout() {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

// Static locale prefixes keep /:locale/<section> from outranking /admin/* for
// shared names like blog, achievements, and challenges.
const siteRoutes = (
  <>
    <Route element={<PublicLayout />}>
      <Route index element={<Landing />} />
      <Route path="play" element={<Play />} />
      <Route path="lobby" element={<Lobby />} />
      <Route path="create" element={<CreateRoom />} />
      <Route path="join" element={<JoinRoom />} />
      <Route path="join/:code" element={<JoinRoom />} />
      <Route path="room/:code" element={<WaitingRoom />} />
      <Route path="results/:code" element={<Results />} />
      <Route path="leaderboard" element={<Leaderboard />} />
      <Route path="blog" element={<Blog />} />
      <Route path="blog/:slug" element={<BlogArticle />} />
      <Route path="rules" element={<Rules />} />
      <Route path="terms" element={<Legal kind="terms" />} />
      <Route path="privacy" element={<Legal kind="privacy" />} />
      <Route path="sign-in" element={<SignIn />} />
      <Route path="sign-up" element={<SignUp />} />
      <Route path="profile" element={<Profile />} />
      <Route path="achievements" element={<Achievements />} />
      <Route path="challenges" element={<Challenges />} />
      <Route path="*" element={<NotFound />} />
    </Route>
    <Route path="game/:code" element={<GameRoom />} />
  </>
);

export default function App() {
  return (
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
  );
}