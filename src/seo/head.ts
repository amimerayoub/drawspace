import { LOCALES, DEFAULT_LOCALE } from '@/i18n/I18nContext';

export const SITE_URL = 'https://drawspace.cloud';

export type HeadTag =
  | { kind: 'title'; text: string }
  | { kind: 'meta'; attr: 'name' | 'property'; key: string; content: string }
  | { kind: 'link'; rel: 'canonical' | 'icon' | 'alternate'; href: string; hreflang?: string }
  | { kind: 'jsonld'; id: string; data: unknown };

export interface HeadInput {
  title: string;
  description: string;
  image: string;
  type: 'website' | 'article';
  canonical: string;
  noindex: boolean;
  locale: string;
  pathname: string;
  siteName: string;
  faviconUrl?: string;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Localized label for a breadcrumb segment, supplied by the caller's i18n. */
  segmentLabel: (segment: string) => string | undefined;
}

const LOCALE_CODES = LOCALES.map((l) => l.code) as string[];

/** `/fr/blog/x` -> `/blog/x`; `/fr` -> `/`. Non-locale paths are returned unchanged. */
export function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  if (!LOCALE_CODES.includes(segments[0])) return pathname;
  const rest = segments.slice(1).join('/');
  return rest ? `/${rest}` : '/';
}

export function localeOf(pathname: string): string | undefined {
  const first = pathname.split('/').filter(Boolean)[0];
  return LOCALE_CODES.includes(first) ? first : undefined;
}

/** Swap the locale prefix of a locale-free route path for every published locale. */
export function alternateUrls(routePath: string): { hreflang: string; href: string }[] {
  const suffix = routePath === '/' ? '' : routePath;
  return LOCALES.map((l) => ({ hreflang: l.code as string, href: `${SITE_URL}/${l.code}${suffix}` }))
    .concat([{ hreflang: 'x-default', href: `${SITE_URL}/${DEFAULT_LOCALE}${suffix}` }]);
}

function humanize(segment: string): string {
  return segment.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:·-]+$/, '')}…`;
}

/** Search results clip long titles, so the brand suffix is dropped first and
    only then is the remaining text cut at a word boundary. */
export function fitTitle(title: string, max = 60): string {
  if (title.length <= max) return title;
  const withoutBrand = title.replace(/\s*·\s*DrawSpace.*$/i, '').trim();
  return truncateAtWord(withoutBrand.length < title.length ? withoutBrand : title, max);
}

export function fitDescription(description: string, max = 155): string {
  return truncateAtWord(description.replace(/\s+/g, ' ').trim(), max);
}

export function organizationSchema(siteName: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: siteName,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/favicon-192.png`,
      width: 192,
      height: 192,
    },
  };
}

export function websiteSchema(siteName: string, description: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: siteName,
    description,
    inLanguage: LOCALE_CODES,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function videoGameSchema(input: { name: string; url: string; description: string; image: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    '@id': `${input.url}#game`,
    name: input.name,
    url: input.url,
    description: input.description,
    image: input.image,
    genre: ['Drawing game', 'Word game', 'Party game'],
    gamePlatform: 'Web browser',
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    playMode: 'MultiPlayer',
    inLanguage: 'en',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export function breadcrumbSchema(
  items: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function asArray(data: HeadInput['structuredData']): Array<Record<string, unknown>> {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/** Breadcrumbs for the public content routes. Home and the blog index are the
    only two levels the router can name without route-specific data. */
function autoBreadcrumbs(input: HeadInput, routePath: string, title: string): { name: string; url: string }[] {
  const segments = routePath.split('/').filter(Boolean);
  if (segments.length === 0) return [];
  const locale = localeOf(input.pathname) ?? DEFAULT_LOCALE;
  const base = `${SITE_URL}/${locale}`;
  const crumbs = [{ name: input.segmentLabel('home') ?? 'Home', url: base }];
  let walked = '';
  segments.forEach((segment, i) => {
    walked += `/${segment}`;
    const isLast = i === segments.length - 1;
    const label = isLast
      ? title.replace(/\s*·\s*DrawSpace.*$/i, '').trim() || humanize(segment)
      : input.segmentLabel(segment) ?? humanize(segment);
    crumbs.push({ name: label, url: `${base}${walked}` });
  });
  return crumbs;
}

/** Single source of truth for the document head. SeoHead applies these tags in
    the browser; scripts/prerender.mjs serializes the same list into static HTML. */
export function buildHeadTags(input: HeadInput): HeadTag[] {
  const routePath = stripLocale(input.pathname);
  const locale = localeOf(input.pathname);
  const title = fitTitle(input.title);
  const description = fitDescription(input.description);
  const tags: HeadTag[] = [
    { kind: 'title', text: title },
    { kind: 'meta', attr: 'name', key: 'robots', content: input.noindex ? 'noindex, follow' : 'index, follow' },
  ];
  if (description) tags.push({ kind: 'meta', attr: 'name', key: 'description', content: description });
  if (input.faviconUrl) tags.push({ kind: 'link', rel: 'icon', href: input.faviconUrl });
  tags.push({ kind: 'link', rel: 'canonical', href: input.canonical });

  const og: [string, string][] = [
    ['og:site_name', input.siteName],
    ['og:title', title],
    ['og:description', description],
    ['og:type', input.type],
    ['og:url', input.canonical],
    ['og:image', input.image],
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
    ['og:image:alt', `${input.siteName} · Draw, guess, learn English`],
    ['og:locale', input.locale.replace('-', '_')],
  ];
  for (const [key, content] of og) if (content) tags.push({ kind: 'meta', attr: 'property', key, content });

  const twitter: [string, string][] = [
    ['twitter:card', 'summary_large_image'],
    ['twitter:title', title],
    ['twitter:description', description],
    ['twitter:image', input.image],
  ];
  for (const [key, content] of twitter) if (content) tags.push({ kind: 'meta', attr: 'name', key, content });

  // hreflang only makes sense on locale-prefixed routes; invite links such as
  // /join/CODE have no translated counterparts.
  if (locale && !input.noindex) {
    for (const alt of alternateUrls(routePath)) {
      tags.push({ kind: 'link', rel: 'alternate', href: alt.href, hreflang: alt.hreflang });
      if (alt.hreflang !== 'x-default' && alt.hreflang !== locale) {
        tags.push({ kind: 'meta', attr: 'property', key: 'og:locale:alternate', content: alt.hreflang.replace('-', '_') });
      }
    }
  }

  const routeSchemas = asArray(input.structuredData);
  const schemas: Array<Record<string, unknown>> = [
    organizationSchema(input.siteName),
    websiteSchema(input.siteName, description),
    ...routeSchemas,
  ];

  const isGamePage = routePath === '/' || routePath === '/play';
  if (isGamePage && !input.noindex) {
    schemas.push(videoGameSchema({
      name: input.siteName,
      url: input.canonical,
      description,
      image: input.image,
    }));
  }

  const hasBreadcrumbs = routeSchemas.some((s) => s['@type'] === 'BreadcrumbList');
  if (!hasBreadcrumbs && !input.noindex) {
    const crumbs = autoBreadcrumbs(input, routePath, title);
    if (crumbs.length > 1) schemas.push(breadcrumbSchema(crumbs));
  }

  tags.push({ kind: 'jsonld', id: 'seo-structured-data', data: schemas });
  return tags;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Client-side applier. Runs only from an effect, never during render. */
export function applyHeadTags(tags: HeadTag[]) {
  // Remove every hreflang/alternate pair first: on a prerendered page the ones
  // React did not create carry no data-seo marker, and leaving them would put
  // the previous route's alternates next to the new ones.
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  document.head.querySelectorAll('meta[property="og:locale:alternate"]').forEach((el) => el.remove());

  for (const tag of tags) {
    if (tag.kind === 'title') {
      document.title = tag.text;
    } else if (tag.kind === 'meta') {
      if (tag.key === 'og:locale:alternate') {
        const el = document.createElement('meta');
        el.setAttribute('property', tag.key);
        el.setAttribute('content', tag.content);
        el.setAttribute('data-seo', '');
        document.head.appendChild(el);
      } else {
        setMeta(tag.attr, tag.key, tag.content);
      }
    } else if (tag.kind === 'link') {
      if (tag.rel === 'alternate') {
        const el = document.createElement('link');
        el.setAttribute('rel', 'alternate');
        el.setAttribute('hreflang', tag.hreflang ?? '');
        el.setAttribute('href', tag.href);
        el.setAttribute('data-seo-hreflang', '');
        document.head.appendChild(el);
      } else {
        let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${tag.rel}"]`);
        if (!el) {
          el = document.createElement('link');
          el.setAttribute('rel', tag.rel);
          document.head.appendChild(el);
        }
        el.setAttribute('href', tag.href);
      }
    } else {
      let script = document.head.querySelector<HTMLScriptElement>(`script[type="application/ld+json"]#${tag.id}`);
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = tag.id;
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(tag.data);
    }
  }
}

export function removeHeadJsonLd(id: string) {
  document.head.querySelector(`script[type="application/ld+json"]#${id}`)?.remove();
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Serialize the same tag list into static HTML for the prerendered head. */
export function headTagsToHtml(tags: HeadTag[]): string {
  const lines: string[] = [];
  for (const tag of tags) {
    if (tag.kind === 'title') lines.push(`<title>${escapeHtml(tag.text)}</title>`);
    else if (tag.kind === 'meta') lines.push(`<meta ${tag.attr}="${tag.key}" content="${escapeHtml(tag.content)}" />`);
    else if (tag.kind === 'link') {
      const hreflang = tag.hreflang ? ` hreflang="${escapeHtml(tag.hreflang)}"` : '';
      lines.push(`<link rel="${tag.rel}"${hreflang} href="${escapeHtml(tag.href)}" />`);
    } else {
      lines.push(`<script type="application/ld+json" id="${tag.id}">${JSON.stringify(tag.data).replace(/</g, '\\u003c')}</script>`);
    }
  }
  return lines.map((l) => `    ${l}`).join('\n');
}