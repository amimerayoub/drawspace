import { createContext, useContext, type ReactNode } from 'react';
import { usePlatformConfigQuery } from '@/hooks/useQueries';

export interface PlatformConfig {
  siteName: string; tagline: string; contactEmail: string; defaultLocale: string;
  maintenance: boolean; registrationOpen: boolean; guestPlay: boolean;
  logoUrl: string; faviconUrl: string; announcement: string; seoTitle: string; seoDescription: string;
  gaMeasurementId: string; gtmContainerId: string;
  updatedAt: string | null;
}

const DEFAULT_CONFIG: PlatformConfig = {
  siteName: 'DrawSpace', tagline: '', contactEmail: 'hello@drawspace.cloud', defaultLocale: 'en',
  maintenance: false, registrationOpen: true, guestPlay: true,
  logoUrl: '', faviconUrl: '', announcement: '', seoTitle: '', seoDescription: '',
  gaMeasurementId: '', gtmContainerId: '', updatedAt: null,
};

interface PlatformConfigValue { config: PlatformConfig; ready: boolean; refresh: () => void }
const PlatformConfigContext = createContext<PlatformConfigValue>({ config: DEFAULT_CONFIG, ready: false, refresh: () => undefined });

export function PlatformConfigProvider({ children }: { children: ReactNode }) {
  const { data, isFetched, refetch } = usePlatformConfigQuery();
  const config = data ? { ...DEFAULT_CONFIG, ...data } : DEFAULT_CONFIG;
  return <PlatformConfigContext.Provider value={{ config, ready: isFetched, refresh: () => { void refetch(); } }}>{children}</PlatformConfigContext.Provider>;
}

export const usePlatformConfig = () => useContext(PlatformConfigContext);