import { useEffect, useRef } from 'react';
import { usePlatformConfig } from '@/context/PlatformConfigContext';

const DEFAULT_GA = 'G-C6NH86LXQY';
const DEFAULT_GTM = 'GTM-NZTCPNLD';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

function injectScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

// Loads GTM + GA4 from the admin-configured IDs once the public config resolves.
// An empty field falls back to the built-in default, so collection never silently stops.
// Changes apply on the next full page load (the tags are injected once per document).
export function AnalyticsTags() {
  const { config, ready } = usePlatformConfig();
  const injected = useRef(false);
  useEffect(() => {
    if (!ready || injected.current) return;
    injected.current = true;
    const gaId = config.gaMeasurementId.trim() || DEFAULT_GA;
    const gtmId = config.gtmContainerId.trim() || DEFAULT_GTM;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    injectScript('ds-gtm', `https://www.googletagmanager.com/gtm.js?id=${gtmId}`);
    injectScript('ds-ga4', `https://www.googletagmanager.com/gtag/js?id=${gaId}`);
    window.gtag('js', new Date());
    window.gtag('config', gaId);
  }, [ready, config.gaMeasurementId, config.gtmContainerId]);
  return null;
}