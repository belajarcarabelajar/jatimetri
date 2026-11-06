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

  it('declares the image size, type and alt text matching the file', () => {
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(meta('property', 'og:image:type')).toBe('image/jpeg');
    expect(meta('property', 'og:image:alt')).toBeTruthy();
  });
});

function meta(attr: 'property' | 'name', key: string): string | undefined {
  return html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];
}

describe('SEO head: Open Graph and Twitter tags', () => {
  it('declares the site identity tags', () => {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    expect(meta('property', 'og:url')).toBe('https://jatimetri.belajarcarabelajar.com/');
    expect(meta('property', 'og:url')).toBe(canonical);
    expect(meta('property', 'og:site_name')).toBe('Jatimetri');
    expect(meta('property', 'og:locale')).toBe('id_ID');
    expect(meta('property', 'og:type')).toBe('website');
  });

  it('keeps og:title in line with <title>', () => {
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    expect(title).toBeTruthy();
    expect(meta('property', 'og:title')).toBe(title);
  });

  it('asks for a large Twitter card', () => {
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('sets a theme-color', () => {
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9A-Fa-f]{6}"/);
  });
});

describe('sitemap.xml', () => {
  it('gives every URL a valid lastmod date', () => {
    const urls = bytes('sitemap.xml').toString().match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      const lastmod = u.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(lastmod!))).toBe(false);
    }
  });
});
