import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, PenLine, MessageSquare, TrendingUp, KeyRound, Users, BookOpen, Target } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { SeoHead } from '@/components/SeoHead';
import { AdSlot } from '@/components/AdSlot';
import { Avatar } from '@/components/Avatar';
import { AchievementIcon } from '@/components/Emblems';
import { Progress } from '@/components/ui';
import { useLeaderboard, usePublicAchievements, usePublicBlogs } from '@/hooks/useQueries';
import type { DictKey } from '@/i18n/en';

function GamePreview() {
  const { t } = useI18n();
  return (
    <div className="preview" aria-label={t('landing.previewTitle')}>
      <div className="preview-top">
        <span className="preview-round mono">{t('game.roundOf', { current: 2, total: 4 })}</span>
        <span className="preview-word mono">_ _ _</span>
        <span className="preview-timer mono">0:42</span>
      </div>
      <div className="preview-body">
        <div className="preview-players">
          {[
            { name: 'maya', avatar: 'av-03', score: 340, drawing: true },
            { name: 'kai', avatar: 'av-01', score: 290, drawing: false },
            { name: 'you', avatar: 'av-08', score: 260, drawing: false },
            { name: 'ines', avatar: 'av-02', score: 180, drawing: false },
          ].map((p) => (
            <div key={p.name} className={`preview-player ${p.drawing ? 'drawing' : ''}`}>
              <Avatar avatarId={p.avatar} size={28} />
              <span className="preview-player-name">{p.name}</span>
              <span className="preview-player-score mono">{p.score}</span>
            </div>
          ))}
        </div>
        <div className="preview-canvas">
          <svg viewBox="0 0 300 200" className="preview-drawing" aria-hidden>
            <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path className="draw-path" d="M110 90 a45 40 0 1 0 90 0 a45 40 0 1 0 -90 0" />
              <path className="draw-path d2" d="M118 62 L108 30 L138 48" />
              <path className="draw-path d3" d="M192 62 L202 30 L172 48" />
              <circle className="draw-path d4" cx="140" cy="85" r="4" fill="currentColor" />
              <circle className="draw-path d4" cx="170" cy="85" r="4" fill="currentColor" />
              <path className="draw-path d5" d="M150 100 q5 6 10 0 M155 100 v6" />
              <path className="draw-path d6" d="M100 95 L70 90 M100 105 L72 110 M210 95 L240 90 M210 105 L238 110" />
            </g>
          </svg>
          <div className="preview-toolbar">
            <span className="preview-tool active"><PenLine size={13} /></span>
            <span className="preview-tool"><span className="preview-swatch" style={{ background: '#18181b' }} /></span>
            <span className="preview-tool"><span className="preview-swatch" style={{ background: '#06b6d4' }} /></span>
            <span className="preview-tool"><span className="preview-swatch" style={{ background: '#a1a1aa' }} /></span>
          </div>
        </div>
        <div className="preview-chat">
          <p className="preview-msg"><strong>ines</strong> dog?</p>
          <p className="preview-msg"><strong>kai</strong> rabbit</p>
          <p className="preview-msg preview-msg-correct"><strong>you</strong> cat</p>
          <p className="preview-msg preview-msg-system">you guessed the word</p>
          <div className="preview-input">
            <span>{t('game.guessPlaceholder')}</span>
            <ArrowRight size={13} />
          </div>
        </div>
      </div>
      <div className="preview-timerbar"><span style={{ width: '58%' }} /></div>
    </div>
  );
}

const FAQ_ITEMS: { q: DictKey; a: DictKey }[] = [
  { q: 'landing.faq1Q', a: 'landing.faq1A' },
  { q: 'landing.faq2Q', a: 'landing.faq2A' },
  { q: 'landing.faq3Q', a: 'landing.faq3A' },
  { q: 'landing.faq4Q', a: 'landing.faq4A' },
  { q: 'landing.faq5Q', a: 'landing.faq5A' },
];

function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState(0);
  return (
    <div className="faq">
      {FAQ_ITEMS.map((item, i) => (
        <div key={item.q} className={`faq-item ${open === i ? 'open' : ''}`}>
          <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
            <span>{t(item.q)}</span>
            <ChevronDown size={16} className="faq-chevron" aria-hidden />
          </button>
          {/* Kept in the DOM while collapsed: FAQPage markup must describe text that is on the page, and `hidden` renders identically. */}
          <p className="faq-a muted" hidden={open !== i}>{t(item.a)}</p>
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { t, path, formatDate } = useI18n();
  const leaderboard = useLeaderboard();
  const blogs = usePublicBlogs({ limit: 3 });
  const catalog = usePublicAchievements();
  const leaders = (leaderboard.data ?? []).slice(0, 5);
  const posts = (blogs.data?.data ?? []).slice(0, 3);
  const achievements = (catalog.data ?? []).slice(0, 4);
  const loadError = leaderboard.error ?? blogs.error ?? catalog.error;
  const loadErrorMessage = loadError instanceof Error ? loadError.message : loadError ? 'Live content could not be loaded.' : '';

  return (
    <>
      <SeoHead
        title={t('seo.homeTitle')}
        description={t('seo.home')}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ_ITEMS.map((item) => ({
            '@type': 'Question',
            name: t(item.q),
            acceptedAnswer: { '@type': 'Answer', text: t(item.a) },
          })),
        }}
      />

      <section className="hero">
        <div className="container">
          <div className="hero-copy">
            <h1 className="hero-title">{t('landing.heroTitle')}</h1>
            <p className="hero-sub">{t('landing.heroSub')}</p>
            <div className="hero-ctas">
              <Link to={path('/play')} className="btn btn-primary btn-lg">{t('common.playNow')}</Link>
              <Link to={path('/join')} className="btn btn-secondary btn-lg" >{t('common.joinWithCode')}</Link>
            </div>
          </div>
          <GamePreview />
        </div>
      </section>

      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t('landing.howTitle')}</h2>
          </div>
          <ol className="steps">
            {[
              { icon: PenLine, title: 'landing.how1Title', body: 'landing.how1Body' },
              { icon: MessageSquare, title: 'landing.how2Title', body: 'landing.how2Body' },
              { icon: TrendingUp, title: 'landing.how3Title', body: 'landing.how3Body' },
            ].map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-num mono">{i + 1}</span>
                <div>
                  <h3 className="step-title">{t(s.title as DictKey)}</h3>
                  <p className="muted step-body">{t(s.body as DictKey)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t('landing.modesTitle')}</h2>
          </div>
          <div className="modes">
            {[
              { icon: Users, title: 'landing.modeClassicTitle', body: 'landing.modeClassicBody', to: '/lobby' },
              { icon: BookOpen, title: 'landing.modeHardTitle', body: 'landing.modeHardBody', to: '/create' },
              { icon: KeyRound, title: 'landing.modePrivateTitle', body: 'landing.modePrivateBody', to: '/create' },
            ].map((m) => (
              <Link key={m.title} to={path(m.to)} className="mode">
                <m.icon size={20} className="mode-icon" aria-hidden />
                <div className="mode-text">
                  <h3 className="mode-title">{t(m.title as DictKey)}</h3>
                  <p className="muted">{t(m.body as DictKey)}</p>
                </div>
                <ArrowRight size={16} className="mode-arrow" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div className="split-copy">
            <h2 className="section-title">{t('landing.xpTitle')}</h2>
            <p className="muted section-sub">{t('landing.xpBody')}</p>
            <Link to={path('/challenges')} className="text-link">
              {t('nav.challenges')} <ArrowRight size={14} />
            </Link>
          </div>
          <div className="panel panel-pad xp-sample">
            <div className="xp-sample-head">
              <Avatar avatarId="av-08" size={40} />
              <div>
                <p className="xp-sample-name">Example player</p>
                <p className="faint xp-sample-title">Illustrative progress</p>
              </div>
              <span className="xp-sample-level mono">{t('common.level')} 12</span>
            </div>
            <Progress value={620} max={1000} label="XP progress" />
            <div className="xp-sample-foot">
              <span className="mono muted">620 / 1,000 XP</span>
              <span className="faint">{t('common.level')} 13</span>
            </div>
          </div>
        </div>
      </section>

      {loadErrorMessage && <div className="container"><p role="status" className="faint">{loadErrorMessage}</p></div>}
      <section className="section">
        <div className="container">
          <div className="section-head section-head-row">
            <h2 className="section-title">{t('landing.achievementsTitle')}</h2>
            <Link to={path('/achievements')} className="text-link">{t('common.viewAll')} <ArrowRight size={14} /></Link>
          </div>
          <div className="achievement-row">
            {achievements.map((a) => (
              <div key={a.id} className="achievement-chip">
                <AchievementIcon achievement={a} size={36} className="achievement-chip-icon" />
                <div>
                  <p className="achievement-chip-name">{a.name}</p>
                  <p className="faint achievement-chip-xp mono">+{a.xpReward} XP</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head section-head-row">
            <h2 className="section-title">{t('landing.leaderboardTitle')}</h2>
            <Link to={path('/leaderboard')} className="text-link">{t('common.viewAll')} <ArrowRight size={14} /></Link>
          </div>
          <div className="panel leaders">
            {leaders.map((l) => (
              <div key={l.rank} className="leader-row">
                <span className={`leader-rank mono ${l.rank <= 3 ? 'top' : ''}`}>{l.rank}</span>
                <Avatar avatarId={l.avatarId} size={32} />
                <span className="leader-name">{l.username}</span>
                <span className="faint leader-level mono">{t('common.level')} {l.level}</span>
                <span className="leader-xp mono">{new Intl.NumberFormat('en-US').format(l.xp)} XP</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div className="split-copy">
            <h2 className="section-title">{t('landing.communityTitle')}</h2>
            <p className="muted section-sub">{t('landing.communityBody')}</p>
            <Link to={path('/rules')} className="text-link">{t('nav.how')} <ArrowRight size={14} /></Link>
          </div>
          <div className="split-copy">
            <h2 className="section-title">{t('landing.blogTitle')}</h2>
            <div className="post-list">
              {posts.map((p) => (
                <Link key={p.id} to={path(`/blog/${p.slug}`)} className="post-row">
                  <div>
                    <p className="post-title">{p.title}</p>
                    <p className="faint post-date">{formatDate(p.publishedAt)}</p>
                  </div>
                  <ArrowRight size={15} className="mode-arrow" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container container-narrow">
          <div className="section-head">
            <h2 className="section-title">{t('landing.faqTitle')}</h2>
          </div>
          <Faq />
        </div>
      </section>

      <div className="container landing-ad">
        <AdSlot placement="landing" />
      </div>
    </>
  );
}
