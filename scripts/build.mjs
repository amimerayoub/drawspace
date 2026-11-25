// Vite 6 derives isProduction from process.env.NODE_ENV, not from the build
// command. Without this, `vite build` with NODE_ENV unset ships development
// React and dev-only JSX transforms.
process.env.NODE_ENV = 'production';
if (process.argv.includes('--analyze')) process.env.ANALYZE = '1';
const { build } = await import('vite');
await build();

// Keep a pristine shell before prerendering rewrites dist/index.html.
const { copyFileSync } = await import('node:fs');
copyFileSync('dist/index.html', 'dist/200.html');

if (!process.argv.includes('--no-prerender')) await import('./prerender.mjs');