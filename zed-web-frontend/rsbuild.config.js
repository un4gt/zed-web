// @ts-check
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

const gatewayOrigin = process.env.GATEWAY_ORIGIN ?? `http://127.0.0.1:${process.env.GATEWAY_PORT ?? '8080'}`;
const monacoEditorAssets = new URL('./node_modules/monaco-editor/min/vs', import.meta.url).pathname;

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  html: {
    title: 'zew',
    tags: [
      {
        tag: 'link',
        attrs: {
          rel: 'icon',
          type: 'image/png',
          sizes: '512x512',
          href: '/zed-app-icon-light.png',
          media: '(prefers-color-scheme: light)',
        },
        head: true,
      },
      {
        tag: 'link',
        attrs: {
          rel: 'icon',
          type: 'image/png',
          sizes: '512x512',
          href: '/zed-app-icon-dark.png',
          media: '(prefers-color-scheme: dark)',
        },
        head: true,
      },
    ],
  },
  output: {
    assetPrefix: '/',
    copy: [
      {
        from: monacoEditorAssets,
        to: 'vs',
      },
    ],
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
      forceSplitting: {
        'async-xterm': /node_modules[\\/]@xterm[\\/]xterm[\\/]/,
      },
    },
  },
  plugins: [pluginReact()],
  server: {
    proxy: {
      '/api': {
        target: gatewayOrigin,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
