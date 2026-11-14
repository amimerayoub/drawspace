import { lazy, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import {
  BarChart3, BookOpen, CalendarDays, ClipboardList, Cog, FileText, Flag, Gamepad2, Globe, Image,
  KeyRound, LayoutDashboard, Lock, Megaphone, Menu, MessageSquare, Palette, ScrollText, Shield, Shapes,
  Sparkles, Trophy, Users, X, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/theme/ThemeContext';
import { Avatar } from '@/components/Avatar';
import { BRAND } from '@/data/assets';
import { Badge, Button, IconButton } from '@/components/ui';
import { NoAccess, useAdmin } from './shared';
const Overview = lazy(() => import('./Overview'));
const UsersAdmin = lazy(() => import('./Users'));
const Roles = lazy(() => import('./Roles'));
const Rooms = lazy(() => import('./Rooms'));
const Words = lazy(() => import('./Words'));
const GameConfig = lazy(() => import('./GameConfig'));
const Crm = lazy(() => import('./Crm'));
const Avatars = lazy(() => import('./Avatars'));
const Titles = lazy(() => import('./Titles'));
const AchievementsAdmin = lazy(() => import('./AchievementsAdmin'));
const ChallengesAdmin = lazy(() => import('./ChallengesAdmin'));
const XpConfig = lazy(() => import('./XpConfig'));
const BlogAdmin = lazy(() => import('./BlogAdmin'));
const Seo = lazy(() => import('./Seo'));
const Ads = lazy(() => import('./Ads'));
const Media = lazy(() => import('./Media'));
const Analytics = lazy(() => import('./Analytics'));
const Moderation = lazy(() => import('./Moderation'));
const Audit = lazy(() => import('./Audit'));
const Matches = lazy(() => import('./Matches'));
const Settings = lazy(() => import('./Settings'));
const McpAdmin = lazy(() => import('./McpAdmin'));

interface NavItem { to: string; label: string; icon: LucideIcon; perm?: string; end?: boolean }
interface NavGroup { label: string; items: NavItem[] }

const NAV: NavGroup[] = [
  { label: '', items: [{ to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true }] },
  {
    label: 'Players',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users, perm: 'users.view' },
      { to: '/admin/roles', label: 'Roles & permissions', icon: Shield, perm: 'roles.manage' },
      { to: '/admin/crm', label: 'CRM & messaging', icon: MessageSquare, perm: 'crm.send' },
      { to: '/admin/moderation', label: 'Moderation', icon: Flag, perm: 'moderation.handle' },
    ],
  },
  {
    label: 'Game',
    items: [
      { to: '/admin/rooms', label: 'Rooms', icon: Gamepad2, perm: 'rooms.view' },
      { to: '/admin/words', label: 'Word bank', icon: BookOpen, perm: 'words.manage' },
      { to: '/admin/game-config', label: 'Game configuration', icon: Cog, perm: 'config.game' },
      { to: '/admin/xp', label: 'XP configuration', icon: Sparkles, perm: 'config.xp' },
    ],
  },
  {
    label: 'Rewards',
    items: [
      { to: '/admin/titles', label: 'Titles', icon: ScrollText, perm: 'rewards.manage' },
      { to: '/admin/achievements', label: 'Achievements', icon: Trophy, perm: 'rewards.manage' },
      { to: '/admin/challenges', label: 'Challenges', icon: CalendarDays, perm: 'challenges.manage' },
    ],
  },
  {
    label: 'Content',
    items: [
      { to: '/admin/blog', label: 'Blog', icon: FileText, perm: 'content.blog' },
      { to: '/admin/seo', label: 'SEO', icon: Globe, perm: 'content.seo' },
      { to: '/admin/ads', label: 'Ads', icon: Megaphone, perm: 'content.ads' },
      { to: '/admin/media', label: 'Media library', icon: Image, perm: 'content.media' },
      { to: '/admin/avatars', label: 'Avatar library', icon: Shapes, perm: 'content.media' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, perm: 'analytics.view' },
      { to: '/admin/matches', label: 'Match inspection', icon: Trophy, perm: 'matches.inspect' },
      { to: '/admin/audit', label: 'Audit logs', icon: ClipboardList, perm: 'audit.view' },
      { to: '/admin/mcp', label: 'MCP server', icon: KeyRound, perm: 'settings.manage' },
      { to: '/admin/settings', label: 'System settings', icon: Palette, perm: 'settings.manage' },
    ],
  },
];

function Gate({ perm, children }: { perm?: string; children: React.ReactNode }) {
  const { can } = useAdmin();
  if (perm && !can(perm)) return <NoAccess />;
  return <>{children}</>;
}

export default function AdminApp() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { isStaff, name, role } = useAdmin();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user || !isStaff) {
    return (
      <div className="admin-gate">
        <div className="panel panel-pad admin-gate-card">
          <Lock size={22} className="accent" aria-hidden />
          <h1 className="admin-title">Admin console</h1>
          <p className="muted">Sign in with an account assigned an active staff role to continue.</p>
          <div className="admin-gate-actions">
            <Link to="/en-US/sign-in" className="btn btn-primary">Sign in</Link>
            <Link to="/en-US" className="btn btn-ghost">Back to site</Link>
          </div>
        </div>
      </div>
    );
  }

  const rolePermissions: Record<string, string[]> = {
    superadmin: ['*'], admin: ['*'], moderator: ['users.view', 'moderation.handle', 'rooms.view', 'audit.view'],
    content_manager: ['words.manage', 'content.blog', 'content.ads', 'content.media'], analyst: ['analytics.view', 'audit.view'], support: ['analytics.view', 'audit.view'],
  };
  const permissions = rolePermissions[role] ?? [];
  const visibleNav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || permissions.includes('*') || permissions.includes(i.perm)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="admin-shell">
      <a href="#admin-main" className="skip-link">Skip to content</a>
      {menuOpen && <div className="admin-scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="admin-side-head">
          <Link to="/admin" className="logo" onClick={() => setMenuOpen(false)}>
            <img className="logo-mark" src={BRAND.icon} alt="" width={26} height={26} />
            <span className="logo-word">DrawSpace</span>
            <Badge tone="outline">admin</Badge>
          </Link>
          <IconButton label="Close menu" className="admin-side-close" onClick={() => setMenuOpen(false)}><X size={17} /></IconButton>
        </div>
        <nav className="admin-nav" aria-label="Admin sections">
          {visibleNav.map((g) => (
            <div key={g.label || 'main'} className="admin-nav-group">
              {g.label && <p className="admin-nav-label">{g.label}</p>}
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <item.icon size={16} aria-hidden />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Avatar avatarId={user.avatarId} size={30} />
          <div className="admin-side-user">
            <span className="admin-side-name">{name}</span>
            <span className="faint admin-side-role">{role}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </aside>

      <div className="admin-body">
        <header className="admin-topbar">
          <IconButton label="Open menu" className="admin-burger" onClick={() => setMenuOpen(true)}><Menu size={18} /></IconButton>
          <span className="admin-topbar-title">Operations console</span>
          <div className="admin-topbar-actions">
            <Button size="sm" variant="ghost" onClick={toggle}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</Button>
            <Link to="/en-US" className="btn btn-secondary btn-sm">View site</Link>
          </div>
        </header>
        <main id="admin-main" className="admin-main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="users" element={<Gate perm="users.view"><UsersAdmin /></Gate>} />
            <Route path="roles" element={<Gate perm="roles.manage"><Roles /></Gate>} />
            <Route path="rooms" element={<Gate perm="rooms.view"><Rooms /></Gate>} />
            <Route path="words" element={<Gate perm="words.manage"><Words /></Gate>} />
            <Route path="game-config" element={<Gate perm="config.game"><GameConfig /></Gate>} />
            <Route path="crm" element={<Gate perm="crm.send"><Crm /></Gate>} />
            <Route path="avatars" element={<Gate perm="content.media"><Avatars /></Gate>} />
            <Route path="titles" element={<Gate perm="rewards.manage"><Titles /></Gate>} />
            <Route path="achievements" element={<Gate perm="rewards.manage"><AchievementsAdmin /></Gate>} />
            <Route path="challenges" element={<Gate perm="challenges.manage"><ChallengesAdmin /></Gate>} />
            <Route path="xp" element={<Gate perm="config.xp"><XpConfig /></Gate>} />
            <Route path="blog" element={<Gate perm="content.blog"><BlogAdmin /></Gate>} />
            <Route path="seo" element={<Gate perm="content.seo"><Seo /></Gate>} />
            <Route path="ads" element={<Gate perm="content.ads"><Ads /></Gate>} />
            <Route path="media" element={<Gate perm="content.media"><Media /></Gate>} />
            <Route path="analytics" element={<Gate perm="analytics.view"><Analytics /></Gate>} />
            <Route path="moderation" element={<Gate perm="moderation.handle"><Moderation /></Gate>} />
            <Route path="audit" element={<Gate perm="audit.view"><Audit /></Gate>} />
            <Route path="mcp" element={<Gate perm="settings.manage"><McpAdmin /></Gate>} />
            <Route path="matches" element={<Gate perm="matches.inspect"><Matches /></Gate>} />
            <Route path="settings" element={<Gate perm="settings.manage"><Settings /></Gate>} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
