// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'https://helicase.pages.dev',

  markdown: {
    shikiConfig: {
      theme: 'material-theme-lighter',
      wrap: true,
    },
  },

  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },

  vite: {
    ssr: {
      // Client-only libs — skip SSR bundling
      external: ['cal-heatmap', 'masonry-layout'],
    },
  },
});
