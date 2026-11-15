/* Custom code rendering shared by the studio preview and the public article.
   HTML/CSS render inline after sanitizing; scripts run only in a sandboxed
   iframe without same-origin access, so they can never reach the app. */
import { useMemo } from 'react';
import { buildPreviewDoc, sanitizeCss, sanitizeHtml } from './sanitize';
import type { CodeConfig } from './types';

export function CustomCodeSection({ code, runScripts, position }: { code: CodeConfig; runScripts: boolean; position: 'header' | 'body' | 'footer' }) {
  const hasScripts = runScripts && Boolean(code.js.trim() || code.headerScript.trim() || code.footerScript.trim());
  const scriptDoc = useMemo(() => buildPreviewDoc({
    html: '', css: '', js: code.js, headerScript: code.headerScript, footerScript: code.footerScript,
    baseCss: 'body{margin:0;background:transparent;color:inherit;font-family:Inter,system-ui,sans-serif}',
  }), [code.js, code.headerScript, code.footerScript]);

  if (!code.enabled) return null;
  const matches = code.placement === 'header' ? position === 'header'
    : code.placement === 'footer' ? position === 'footer'
    : position === 'body';
  if (!matches) return null;

  const cleanHtml = sanitizeHtml(code.html, 'block');
  const cleanCss = sanitizeCss(code.css);
  if (!cleanHtml.trim() && !cleanCss.trim() && !hasScripts) return null;

  return (
    <div className="st-custom-code">
      {cleanCss.trim() && <style>{cleanCss}</style>}
      {cleanHtml.trim() && <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />}
      {hasScripts && (
        <iframe
          title="Custom code frame" srcDoc={scriptDoc} sandbox="allow-scripts"
          style={{ height: code.height > 0 ? code.height : 0, border: 0, width: '100%', display: code.height > 0 ? 'block' : 'none' }}
        />
      )}
    </div>
  );
}