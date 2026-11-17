import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

const analyze = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    ...(analyze ? [visualizer({ template: 'raw-data', gzipSize: true, filename: 'bundle-stats.json' })] : []),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('socket.io') || id.includes('engine.io')) return 'socket';
          if (id.includes('appwrite') || id.includes('bignumber')) return 'appwrite';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
          if (id.includes('react-dom') || id.includes('scheduler') || /node_modules\/react\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: true },
});