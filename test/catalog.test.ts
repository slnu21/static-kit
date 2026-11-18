import { describe, expect, it } from 'vitest';
import {
  BRAND,
  PRODUCTS,
  escapeHtml,
  findProduct,
  listProducts,
  productName,
  productTagline,
  productUrl,
  renderOtherTools,
  type Product,
} from '../src/catalog';

const sample: Product[] = [
  { id: 'a', name: 'Alpha', tagline: { ko: '알파', en: 'Alpha tool' }, kind: 'web', status: 'live', url: 'https://a.example', icon: '🅰', color: '#111111' },
  { id: 'b', name: { ko: '베타', en: 'Beta' }, tagline: { ko: '베타 <곧>', en: 'Beta "soon"' }, kind: 'web', status: 'soon', url: 'https://b.example', icon: '🅱', color: '#222222' },
  { id: 'c', name: 'C & Co', tagline: { ko: '씨', en: 'See' }, kind: 'desktop', status: 'live', url: 'https://store.example/c?x=1&y=2', icon: '©', color: '#333333', platform: 'Windows' },
];

describe('catalog data', () => {
  it('has unique kebab-case ids and complete fields', () => {
    const ids = PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRODUCTS) {
      expect(p.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(p.tagline.ko.length).toBeGreaterThan(0);
      expect(p.tagline.en.length).toBeGreaterThan(0);
      expect(productName(p, 'ko').length).toBeGreaterThan(0);
      expect(productName(p, 'en').length).toBeGreaterThan(0);
      expect(p.url).toMatch(/^https:\/\//);
      expect(p.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.icon.length).toBeGreaterThan(0);
    }
  });

  it('lists desktop apps only with a Microsoft Store URL and a platform', () => {
    for (const p of listProducts({ kind: 'desktop' })) {
      expect(p.url).toMatch(/^https:\/\/apps\.microsoft\.com\/detail\/[0-9A-Z]{12}$/);
      expect(p.platform).toBe('Windows');
      expect(p.status).toBe('live');
    }
  });

  it('lists exactly the Microsoft Store apps from the blog apps page, in that order', () => {
    // 원천: SlnU-blog/_pages/apps/index.md "Microsoft Store" 표(사용자 관리 공식 목록)
    expect(listProducts({ kind: 'desktop' }).map((p) => [p.id, p.url.slice(-12)])).toEqual([
      ['atlas', '9NMW5KS7HD1R'],
      ['shotlog', '9PC70G3LNQ8Q'],
      ['clowder', '9N4795KFCRC3'],
      ['readme-md', '9N9QMXQPND3H'],
      ['todo-md', '9NLK1K3WVK8F'],
      ['pulsardock', '9NLVDQ785190'],
      ['queuey', '9PNV73XF9B4N'],
    ]);
    expect(productName(findProduct('queuey')!, 'ko')).toBe('Queuey(큐이)');
    expect(productName(findProduct('queuey')!, 'en')).toBe('Queuey');
  });

  it('keeps web tools on ondolworks.com subdomains and has no games yet', () => {
    for (const p of listProducts({ kind: 'web' })) expect(new URL(p.url).hostname).toMatch(/\.ondolworks\.com$/);
    expect(listProducts({ kind: 'game' })).toEqual([]);
  });

  it('contains the known entries', () => {
    expect(findProduct('pulsar-timer')?.url).toBe('https://timer.ondolworks.com');
    expect(findProduct('pulsar-timer')?.status).toBe('live');
    expect(findProduct('readme-md-web')?.status).toBe('live');
    expect(productUrl(findProduct('readme-md-web')!, 'ko')).toBe('https://md.ondolworks.com/ko/');
    // Archyscape 웹판 — 2026-11-17 라이브 확인 후 live
    expect(findProduct('archyscape-web')?.status).toBe('live');
    expect(productUrl(findProduct('archyscape-web')!, 'en')).toBe('https://archy.ondolworks.com/en/');
    // Cairn 웹판은 한국어만 — 언어 경로 없이 루트로
    expect(findProduct('cairn-web')?.status).toBe('soon');
    expect(productUrl(findProduct('cairn-web')!, 'en')).toBe('https://cairn.ondolworks.com');
    expect(findProduct('nope')).toBeUndefined();
    expect(BRAND.url).toBe('https://ondolworks.com');
  });
});

describe('listProducts', () => {
  it('returns everything in catalog order by default', () => {
    expect(listProducts({}, sample).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(listProducts(undefined, sample)).toHaveLength(3);
  });
  it('filters by kind, status and exclude (single or list)', () => {
    expect(listProducts({ kind: 'web' }, sample).map((p) => p.id)).toEqual(['a', 'b']);
    expect(listProducts({ kind: ['desktop', 'game'] }, sample).map((p) => p.id)).toEqual(['c']);
    expect(listProducts({ status: 'live' }, sample).map((p) => p.id)).toEqual(['a', 'c']);
    expect(listProducts({ exclude: 'a' }, sample).map((p) => p.id)).toEqual(['b', 'c']);
    expect(listProducts({ exclude: ['a', 'c'], status: ['live', 'soon'] }, sample).map((p) => p.id)).toEqual(['b']);
    expect(listProducts({ kind: 'web', status: 'live', exclude: 'a' }, sample)).toEqual([]);
  });
  it('does not mutate the source', () => {
    const before = sample.map((p) => p.id);
    listProducts({ exclude: 'a' }, sample).pop();
    expect(sample.map((p) => p.id)).toEqual(before);
  });
});

describe('names and escaping', () => {
  it('localizes names and taglines', () => {
    expect(productName(sample[1]!, 'ko')).toBe('베타');
    expect(productName(sample[1]!, 'en')).toBe('Beta');
    expect(productName(sample[0]!, 'ko')).toBe('Alpha');
    expect(productTagline(sample[0]!, 'en')).toBe('Alpha tool');
  });
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('productUrl', () => {
  it('adds the language home only for products with localePaths', () => {
    expect(productUrl({ ...sample[0]!, localePaths: true }, 'ko')).toBe('https://a.example/ko/');
    expect(productUrl({ ...sample[0]!, url: 'https://a.example/', localePaths: true }, 'en')).toBe('https://a.example/en/');
    expect(productUrl(sample[2]!, 'ko')).toBe('https://store.example/c?x=1&y=2');
    expect(productUrl(findProduct('pulsar-timer')!, 'en')).toBe('https://timer.ondolworks.com/en/');
  });
  it('is used by renderOtherTools', () => {
    const html = renderOtherTools('ko', 'b', { products: [{ ...sample[0]!, localePaths: true }] });
    expect(html).toContain('href="https://a.example/ko/"');
  });
});

describe('renderOtherTools', () => {
  it('excludes the current tool, links live ones and shows soon as text', () => {
    const html = renderOtherTools('en', 'a', { products: sample });
    expect(html).not.toContain('data-id="a"');
    expect(html).toContain('<nav class="ow-other" aria-label="More from Ondol Works">');
    expect(html).toContain('<span class="ow-other__label">More from Ondol Works</span>');
    // soon: no link, note shown, tagline escaped in title
    expect(html).toContain('<li class="ow-other__item" data-id="b" data-kind="web" data-status="soon"><span title="Beta &quot;soon&quot;">Beta</span> <small class="ow-other__note">(coming soon)</small></li>');
    expect(html).not.toContain('https://b.example');
    // live desktop: escaped URL/name + platform note
    expect(html).toContain('<a href="https://store.example/c?x=1&amp;y=2" title="See">C &amp; Co</a> <small class="ow-other__note">Windows</small>');
    // hub link last, language-specific
    expect(html).toMatch(/<li class="ow-other__item ow-other__hub"><a href="https:\/\/ondolworks\.com\/en\/">See all<\/a><\/li><\/ul><\/nav>$/);
  });

  it('localizes to Korean', () => {
    const html = renderOtherTools('ko', 'c', { products: sample });
    expect(html).toContain('aria-label="Ondol Works의 다른 도구"');
    expect(html).toContain('>베타</span> <small class="ow-other__note">(준비 중)</small>');
    expect(html).toContain('href="https://ondolworks.com/ko/">모두 보기</a>');
    expect(html).toContain('title="알파">Alpha</a></li>');
  });

  it('supports hiding soon, kind filter, no hub link, custom class/label/element', () => {
    const html = renderOtherTools('en', 'x', { products: sample, soon: 'hide', kind: 'web', hubLink: false, className: 'foo', label: 'Also', element: 'div' });
    expect(html).toBe('<div class="foo"><span class="foo__label">Also</span> <ul class="foo__list"><li class="foo__item" data-id="a" data-kind="web" data-status="live"><a href="https://a.example" title="Alpha tool">Alpha</a></li></ul></div>');
  });

  it('returns an empty string when nothing is left', () => {
    expect(renderOtherTools('en', 'a', { products: sample, kind: 'web', soon: 'hide' })).toBe('');
    expect(renderOtherTools('en', 'a', { products: [] })).toBe('');
  });

  it('works on the real catalog for Pulsar Timer', () => {
    const html = renderOtherTools('ko', 'pulsar-timer');
    expect(html).not.toContain('timer.ondolworks.com');
    expect(html).toContain('README.md 웹');
    expect(html).toContain('apps.microsoft.com');
  });
});
