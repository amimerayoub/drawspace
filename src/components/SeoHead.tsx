import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { usePlatformConfig } from '@/context/PlatformConfigContext';
import { BRAND } from '@/data/assets';

const SITE_URL = 'https://drawspace.cloud';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/* Per-route document head: title, description, canonical URL, Open Graph and
   Twitter Card. The generated home share card is the default social image. */
export function SeoHead({ title, description, image = BRAND.ogHome, type = 'website', canonical: canonicalOverride, noindex = false, structuredData }: {
  title: string; description?: string; image?: string; type?: 'website' | 'article'; canonical?: string; noindex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  const { locale } = useI18n();
  const { pathname } = useLocation();
  const { config } = usePlatformConfig();
  useEffect(() => {
    document.title = title;
    setMeta('name', 'robots', noindex ? 'noindex, follow' : 'index, follow');
    const resolvedDescription = description || config.seoDescription || config.tagline;
    if (resolvedDescription) setMeta('name', 'description', resolvedDescription);
    const desc = document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    const canonical = canonicalOverride || `${SITE_URL}${pathname}`;

    if (config.faviconUrl) setLink('icon', config.faviconUrl);
    setLink('canonical', canonical);
    setMeta('property', 'og:site_name', config.siteName);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('property', 'og:image:alt', `${config.siteName} · Draw, guess, learn English`);
    setMeta('property', 'og:locale', locale.replace('-', '_'));

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', image);

    if (structuredData) {
      let script = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]#seo-structured-data');
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'seo-structured-data';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(structuredData);
    }

    return () => {
      document.head.querySelector('script[type="application/ld+json"]#seo-structured-data')?.remove();
    };
  }, [title, description, image, type, canonicalOverride, noindex, structuredData, locale, pathname, config.siteName, config.faviconUrl, config.seoDescription, config.tagline]);
  return null;
}