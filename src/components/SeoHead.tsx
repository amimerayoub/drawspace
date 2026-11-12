import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
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
export function SeoHead({ title, description, image = BRAND.ogHome, type = 'website' }: {
  title: string; description?: string; image?: string; type?: 'website' | 'article';
}) {
  const { locale } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = title;
    if (description) setMeta('name', 'description', description);
    const desc = document.head.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    const canonical = `${SITE_URL}${pathname}`;

    setLink('canonical', canonical);
    setMeta('property', 'og:site_name', 'DrawSpace');
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('property', 'og:image:alt', 'DrawSpace · Draw, guess, learn English');
    setMeta('property', 'og:locale', locale.replace('-', '_'));

    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', image);
  }, [title, description, image, type, locale, pathname]);
  return null;
}