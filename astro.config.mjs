import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import feedImages from './ops/feed-images.mjs';

// Static files only, no adapter. React runs only inside the interactive pieces (islands);
// everything else is plain HTML. Tailwind is compiled into one stylesheet at build time.
export default defineConfig({
  site: 'https://pennypawsgames.com',
  trailingSlash: 'always',
  // feedImages fetches the product pictures the feed names (checked by SHA-256) before the build.
  integrations: [feedImages(), react()],
  build: { format: 'directory', inlineStylesheets: 'never' },
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
  server: { host: '127.0.0.1' },
});
