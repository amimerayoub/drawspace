import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Locale } from '@/types';
import { dictionaries } from './translations';
import type { DictKey } from './en';

export const LOCALES: { code: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en-US', label: 'English (US)', dir: 'ltr' },
  { code: 'en-GB', label: 'English (UK)', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'de', label: 'Deutsch', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'pt-BR', label: 'Português (BR)', dir: 'ltr' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
];

export const DEFAULT_LOCALE: Locale = 'en-US';

interface I18nCtx {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  path: (path: string) => string;
  formatDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (n: number) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const dir = LOCALES.find((l) => l.code === locale)?.dir ?? 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = (key: DictKey, vars?: Record<string, string | number>) => {
    const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
    let text = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    }
    return text;
  };

  const path = (p: string) => `/${locale}${p === '/' ? '' : p}`;

  const formatDate = (iso: string, opts?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, opts ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));

  const formatNumber = (n: number) => new Intl.NumberFormat(locale).format(n);

  return <Ctx.Provider value={{ locale, dir, t, path, formatDate, formatNumber }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}