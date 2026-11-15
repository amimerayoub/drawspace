import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiGet } from '@/services/apiClient';

export interface PlatformConfig {
  siteName: string; tagline: string; contactEmail: string; defaultLocale: string;
  maintenance: boolean; registrationOpen: boolean; guestPlay: boolean;
  logoUrl: string; faviconUrl: string; announcement: string; seoTitle: string; seoDescription: string;
  updatedAt: string | null;
}

const DEFAULT_CONFIG: PlatformConfig = {
  siteName: 'DrawSpace', tagline: '', contactEmail: 'hello@drawspace.cloud', defaultLocale: 'en',
  maintenance: false, registrationOpen: true, guestPlay: true,
  logoUrl: '', faviconUrl: '', announcement: '', seoTitle: '', seoDescription: '', updatedAt: null,
};

interface PlatformConfigValue { config: PlatformConfig; ready: boolean; refresh: () => void }
const PlatformConfigContext = createContext<PlatformConfigValue>({ config: DEFAULT_CONFIG, ready: false, refresh: () => undefined });

export function PlatformConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(() => {
    apiGet<PlatformConfig>('/api/platform/config', { auth: 'none' })
      .then((data) => setConfig({ ...DEFAULT_CONFIG, ...data }))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(interval); };
  }, [refresh]);
  return <PlatformConfigContext.Provider value={{ config, ready, refresh }}>{children}</PlatformConfigContext.Provider>;
}

export const usePlatformConfig = () => useContext(PlatformConfigContext);