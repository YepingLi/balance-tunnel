import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PWA files', () => {
  it('declares a standalone landscape app and required icons', () => {
    const manifest = JSON.parse(readFileSync(resolve('public/manifest.webmanifest'), 'utf8')) as {
      display: string; orientation: string; icons: Array<{ sizes: string }>;
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  });

  it('has an offline service worker shell', () => {
    const worker = readFileSync(resolve('public/sw.js'), 'utf8');
    expect(worker).toContain("balance-tunnel-v3");
    expect(worker).toContain("addEventListener('fetch'");
  });
});
