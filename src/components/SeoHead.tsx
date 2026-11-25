import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import type { DictKey } from '@/i18n/en';
import { usePlatformConfig } from '@/context/PlatformConfigContext';
import { BRAND } from '@/data/assets';
import { SITE_URL, applyHeadTags, buildHeadTags, removeHeadJsonLd } from '@/seo/head';
import { useHeadCollector } from '@/seo/HeadCollector';

const SEGMENT_KEYS: Record<string, DictKey> = {
  home: 'nav.home',
  play: 'nav.play',
  rules: 'nav.how',
  leaderboard: 'nav.leaderboard',
  blog: 'nav.blog',
  terms: 'landing.terms',
  privacy: 'landing.privacy',
  'sign-in': 'nav.signIn',
  'sign-up': 'nav.signUp',
  profile: 'nav.profile',
  achievements: 'nav.achievements',
  challenges: 'nav.challenges',
};

/* Per-route document head: title, description, canonical, hreflang, Open Graph,
   Twitter Card and JSON-LD. The tag list is built once and shared with the
   prerenderer so static HTML and the live SPA can never drift apart. */
export function SeoHead({ title, description, image = BRAND.ogHome, type = 'website', canonical: canonicalOverride, noindex = false, structuredData }: {
  title: string; description?: string; image?: string; type?: 'website' | 'article'; canonical?: string; noindex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  const { locale, t } = useI18n();
  const { pathname } = useLocation();
  const { config } = usePlatformConfig();
  const collector = useHeadCollector();

  const tags = buildHeadTags({
    title,
    description: description || config.seoDescription || config.tagline || '',
    image,
    type,
    canonical: canonicalOverride || `${SITE_URL}${pathname}`,
    noindex,
    locale,
    pathname,
    siteName: config.siteName,
    faviconUrl: config.faviconUrl,
    structuredData,
    segmentLabel: (segment) => {
      const key = SEGMENT_KEYS[segment];
      return key ? t(key) : undefined;
    },
  });
  const signature = JSON.stringify(tags);

  if (collector) collector.set(tags);

  useEffect(() => {
    if (collector) return;
    applyHeadTags(tags);
    return () => removeHeadJsonLd('seo-structured-data');
    // `tags` is a fresh array every render, so the serialized form is the dep.
  }, [signature, collector]);

  return null;
}