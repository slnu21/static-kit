// Ondol Works product catalog — the single source for "which tools exist and where they live".
// Consumed by the hub site (ondolworks.com) and by each tool's "other tools" line.
// Pure data + pure string helpers: no DOM, no network, no dependencies.
//
// Add a product here, rebuild, and re-vendor dist/catalog.js into the consumers.
// Desktop entries are listed only once they are actually published on the Microsoft Store.

export type CatalogLang = 'ko' | 'en';
export type ProductKind = 'web' | 'desktop' | 'game';
export type ProductStatus = 'live' | 'soon';

export interface LocalizedText {
  ko: string;
  en: string;
}

export interface Product {
  /** Stable kebab-case id (used for `exclude`, `currentId`, analytics-free anchors). */
  id: string;
  /** Display name. A plain string when it is the same in every language. */
  name: string | LocalizedText;
  /** One-line description. */
  tagline: LocalizedText;
  kind: ProductKind;
  status: ProductStatus;
  /** Web address for web tools, Microsoft Store page for desktop apps. */
  url: string;
  /** Trusted inline SVG markup (24×24 viewBox, `currentColor`) or a single emoji. */
  icon: string;
  /** Brand color (hex). */
  color: string;
  /** Platform note for non-web products, e.g. "Windows". */
  platform?: string;
}

export const BRAND = {
  name: 'Ondol Works',
  url: 'https://ondolworks.com',
} as const;

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Ordered: web → desktop → game, live before soon inside each kind (listProducts keeps this order). */
export const PRODUCTS: readonly Product[] = [
  {
    id: 'pulsar-timer',
    name: 'Pulsar Timer',
    tagline: {
      ko: '여러 타이머와 뽀모도로를 한 화면에서, 설치 없이.',
      en: 'Multiple timers and pomodoros side by side, no install.',
    },
    kind: 'web',
    status: 'live',
    url: 'https://timer.ondolworks.com',
    icon: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
    color: '#0F6CBD',
  },
  {
    id: 'readme-md-web',
    name: { ko: 'README.md 웹', en: 'README.md for Web' },
    tagline: {
      ko: '브라우저에서 바로 여는 마크다운 리더·에디터.',
      en: 'A Markdown reader and editor that opens right in your browser.',
    },
    kind: 'web',
    status: 'soon',
    url: 'https://md.ondolworks.com',
    icon: svg('<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 17v-5l2 2.5 2-2.5v5M15.5 12v5m-1.8-1.8 1.8 1.8 1.8-1.8"/>'),
    color: '#3D7A5C',
  },
  {
    id: 'readme-md',
    name: 'README.md',
    tagline: {
      ko: '에이전트가 쓴 문서를 사람이 읽는 자리 — 가벼운 마크다운 리더·에디터.',
      en: 'Where people read what agents write — a lightweight Markdown reader and editor.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9N9QMXQPND3H',
    icon: svg('<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h5"/>'),
    color: '#2F6B4F',
    platform: 'Windows',
  },
  {
    id: 'shotlog',
    name: 'ShotLog',
    tagline: {
      ko: '화면을 캡처하고, 그 자리에서 메모하고, 한 번에 정리.',
      en: 'Capture your screen, jot a note on the spot, organize in one go.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9PC70G3LNQ8Q',
    icon: svg('<path d="M3 8V5h3M21 8V5h-3M3 16v3h3M21 16v3h-3"/><circle cx="12" cy="12" r="3.2"/>'),
    color: '#C2532F',
    platform: 'Windows',
  },
  {
    id: 'clowder',
    name: 'Clowder',
    tagline: {
      ko: '여러 Claude Code 세션을 한 화면에서 다루는 터미널 워크스페이스.',
      en: 'A terminal workspace for running parallel Claude Code sessions on one screen.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9N4795KFCRC3',
    icon: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15H17"/>'),
    color: '#6B4FA0',
    platform: 'Windows',
  },
];

export interface ListOptions {
  kind?: ProductKind | ProductKind[];
  status?: ProductStatus | ProductStatus[];
  /** Product id(s) to leave out (e.g. the current tool). */
  exclude?: string | string[];
}

const asList = <T>(v: T | T[] | undefined): T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

/** Filter the catalog. Keeps catalog order. `products` defaults to PRODUCTS (injectable for tests). */
export function listProducts(opts: ListOptions = {}, products: readonly Product[] = PRODUCTS): Product[] {
  const kinds = asList(opts.kind);
  const statuses = asList(opts.status);
  const excluded = new Set(asList(opts.exclude) ?? []);
  return products.filter(
    (p) => (!kinds || kinds.includes(p.kind)) && (!statuses || statuses.includes(p.status)) && !excluded.has(p.id),
  );
}

export function findProduct(id: string, products: readonly Product[] = PRODUCTS): Product | undefined {
  return products.find((p) => p.id === id);
}

export function productName(p: Product, lang: CatalogLang): string {
  return typeof p.name === 'string' ? p.name : p.name[lang];
}

export function productTagline(p: Product, lang: CatalogLang): string {
  return p.tagline[lang];
}

/** Escape text for HTML text and double-quoted attribute contexts. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const OTHER_COPY: Record<CatalogLang, { label: string; soon: string; all: string }> = {
  ko: { label: 'Ondol Works의 다른 도구', soon: '준비 중', all: '모두 보기' },
  en: { label: 'More from Ondol Works', soon: 'coming soon', all: 'See all' },
};

export interface OtherToolsOptions {
  /** Which kinds to list. Default: every kind. */
  kind?: ProductKind | ProductKind[];
  /**
   * How to show `soon` products. 'text' (default): plain text with a "coming soon" note, no link
   * (the address is not live yet, so a link would 404). 'hide': leave them out.
   */
  soon?: 'text' | 'hide';
  /** Append a link to the hub. Default true. */
  hubLink?: boolean;
  /** Override the leading label. */
  label?: string;
  /** Root class name. Child classes are `${className}__label|__list|__item|__note`. Default 'ow-other'. */
  className?: string;
  /** Element to render: 'nav' (default, landmark with aria-label) or 'div'. */
  element?: 'nav' | 'div';
  products?: readonly Product[];
}

/**
 * One line of links to the other Ondol Works products, as an HTML string (no DOM needed — usable
 * at build time). Live products link out (desktop apps to their Store page, with a platform note);
 * `soon` products show as plain text. Returns '' when there is nothing to show.
 *
 * Markup:
 *   <nav class="ow-other" aria-label="…"><span class="ow-other__label">…</span>
 *   <ul class="ow-other__list"><li class="ow-other__item" data-id="…" data-status="…">…</li>…</ul></nav>
 */
export function renderOtherTools(lang: CatalogLang, currentId: string, opts: OtherToolsOptions = {}): string {
  const copy = OTHER_COPY[lang];
  const cls = opts.className ?? 'ow-other';
  const tag = opts.element ?? 'nav';
  const listOpts: ListOptions = { exclude: currentId };
  if (opts.kind !== undefined) listOpts.kind = opts.kind;
  if (opts.soon === 'hide') listOpts.status = 'live';
  const items = listProducts(listOpts, opts.products ?? PRODUCTS);
  if (items.length === 0) return '';

  const label = opts.label ?? copy.label;
  const lis = items.map((p) => {
    const name = escapeHtml(productName(p, lang));
    const title = escapeHtml(productTagline(p, lang));
    const attrs = `class="${cls}__item" data-id="${escapeHtml(p.id)}" data-kind="${p.kind}" data-status="${p.status}"`;
    if (p.status === 'soon') {
      return `<li ${attrs}><span title="${title}">${name}</span> <small class="${cls}__note">(${copy.soon})</small></li>`;
    }
    const note = p.platform ? ` <small class="${cls}__note">${escapeHtml(p.platform)}</small>` : '';
    return `<li ${attrs}><a href="${escapeHtml(p.url)}" title="${title}">${name}</a>${note}</li>`;
  });
  if (opts.hubLink !== false) {
    lis.push(`<li class="${cls}__item ${cls}__hub"><a href="${BRAND.url}/${lang}/">${copy.all}</a></li>`);
  }
  const aria = tag === 'nav' ? ` aria-label="${escapeHtml(label)}"` : '';
  return `<${tag} class="${cls}"${aria}><span class="${cls}__label">${escapeHtml(label)}</span> <ul class="${cls}__list">${lis.join('')}</ul></${tag}>`;
}
