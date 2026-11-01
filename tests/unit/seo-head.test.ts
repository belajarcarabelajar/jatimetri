import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const bytes = (f: string) => readFileSync(path.join(root, 'public', f));

// Google favicon rules: ICO/PNG (not SVG), square, > 48x48; logo PNG >= 112x112 in JSON-LD.
describe('SEO head: favicon and logo', () => {
  it('links the ICO, PNG and apple-touch icons before the SVG', () => {
    const ico = html.indexOf('href="/favicon.ico"');
    const png = html.indexOf('href="/icon-192.png"');
    const svg = html.indexOf('href="/favicon.svg"');
    expect(ico).toBeGreaterThan(-1);
    expect(png).toBeGreaterThan(ico);
    expect(svg).toBeGreaterThan(png);
    expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"');
  });

  it('declares an Organization logo in JSON-LD', () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
      JSON.parse(m[1]),
    );
    const org = blocks.find((b) => b['@type'] === 'Organization');
    expect(org?.logo).toBe('https://jatimetri.belajarcarabelajar.com/logo.png');
  });

  it('ships square PNGs of the expected sizes', () => {
    for (const [f, n] of [['logo.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]] as const) {
      const b = bytes(f);
      expect(b.subarray(1, 4).toString()).toBe('PNG');
      expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([n, n]);
    }
  });

  it('ships a real ICO with a 48x48 entry', () => {
    const b = bytes('favicon.ico');
    expect([b.readUInt16LE(0), b.readUInt16LE(2)]).toEqual([0, 1]);
    const sizes = Array.from({ length: b.readUInt16LE(4) }, (_, i) => b[6 + i * 16]);
    expect(sizes).toContain(48);
  });
});

// og:image must point at a real file: a missing one falls through to the SPA and serves HTML (audit 2026-11-01).
describe('SEO head: social preview image', () => {
  const jpegSize = (b: Buffer): [number, number] => {
    expect(b.readUInt16BE(0)).toBe(0xffd8);
    for (let i = 2; i < b.length; ) {
      const marker = b.readUInt16BE(i);
      if (marker >= 0xffc0 && marker <= 0xffc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
    throw new Error('no SOF marker');
  };

  it('og:image is a 1200x630 JPEG in public/', () => {
    const url = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(url).toBeDefined();
    const { host, pathname } = new URL(url!);
    expect(host).toBe('jatimetri.belajarcarabelajar.com');
    expect(jpegSize(bytes(pathname.slice(1)))).toEqual([1200, 630]);
  });
});
