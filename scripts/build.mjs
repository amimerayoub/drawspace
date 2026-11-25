// Vite 6 derives isProduction from process.env.NODE_ENV, not from the build
// command. Without this, `vite build` with NODE_ENV unset ships development
// React and dev-only JSX transforms.
process.env.NODE_ENV = 'production';
if (process.argv.includes('--analyze')) process.env.ANALYZE = '1';
const { build } = await import('vite');
await build();

// Keep a pristine shell for the routes that are never prerendered: /admin,
// invite links and unknown URLs. Static hosting resolves real files first, so
// only those requests reach this fallback — and none of them may be indexed.
const { copyFileSync, readFileSync, writeFileSync } = await import('node:fs');
copyFileSync('dist/index.html', 'dist/200.html');
const shell = readFileSync('dist/200.html', 'utf8');
const shellWithRobots = shell.replace('</head>', '    <meta name="robots" content="noindex, follow" />\n  </head>');
if (shellWithRobots === shell) throw new Error('dist/200.html: </head> not found, cannot mark the fallback shell noindex');
writeFileSync('dist/200.html', shellWithRobots);

if (!process.argv.includes('--no-prerender')) await import('./prerender.mjs');