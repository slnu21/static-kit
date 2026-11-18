// Ondol Works product catalog — the single source for "which tools exist and where they live".
// Consumed by the hub site (ondolworks.com) and by each tool's "other tools" line.
// Pure data + pure string helpers: no DOM, no network, no dependencies.
//
// Add a product here, rebuild, and re-vendor dist/catalog.js into the consumers.
// Desktop entries = apps published on the Microsoft Store, following the official list on the blog's apps page
// (SlnU-blog/_pages/apps/index.md, "Microsoft Store" table): same apps, same order, Store IDs from there.

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
  /** True when the web tool serves language homes at `/ko/` and `/en/` (see productUrl). */
  localePaths?: boolean;
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
    localePaths: true,
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
    status: 'live',
    url: 'https://md.ondolworks.com',
    localePaths: true,
    icon: svg('<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 17v-5l2 2.5 2-2.5v5M15.5 12v5m-1.8-1.8 1.8 1.8 1.8-1.8"/>'),
    color: '#3D7A5C',
  },
  {
    id: 'archyscape-web',
    name: 'Archyscape',
    tagline: {
      ko: '건물·랙·서버·가상화·서비스를 레이어로 겹쳐 그리는 인프라 구성도.',
      en: 'Infrastructure diagrams drawn as stacked layers — building, racks, servers, virtualization, services.',
    },
    kind: 'web',
    status: 'live',
    url: 'https://archy.ondolworks.com',
    localePaths: true,
    icon: svg('<path d="M12 3 3 7.5 12 12l9-4.5z"/><path d="M3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>'),
    color: '#3B6CF6',
  },
  {
    id: 'cairn-web',
    name: 'Cairn',
    tagline: {
      ko: '템플릿으로 일정을 역산하고 빠진 항목을 잡는 프로젝트 계획 도구(베타).',
      en: 'Project planning from templates — back-scheduled dates and no silently skipped items (beta, Korean UI).',
    },
    kind: 'web',
    status: 'soon',
    url: 'https://cairn.ondolworks.com',
    icon: svg('<ellipse cx="12" cy="18" rx="7.5" ry="3"/><ellipse cx="12" cy="11.5" rx="5.5" ry="2.5"/><ellipse cx="12" cy="6" rx="3.5" ry="2"/>'),
    color: '#2B5FA8',
  },
  // Desktop: Microsoft Store apps, in the order of the official list on the blog
  // (SlnU-blog/_pages/apps/index.md, "Microsoft Store" table — the user's source of truth).
  {
    id: 'atlas',
    name: 'Atlas',
    tagline: {
      ko: '혼자 쓰는 로컬 우선 프로젝트 관리 — 일정·이슈·회의록·자료를 한 화면에.',
      en: 'Local-first project management for one person: schedule, issues, meeting notes and files on one screen.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9NMW5KS7HD1R',
    icon: svg('<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    color: '#1F7A75',
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
      ko: '여러 Claude Code 세션을 나란히 — 터미널·git·탐색기·뷰어를 한 창에.',
      en: 'A terminal workspace for parallel Claude Code sessions, with git, explorer and viewer in one window.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9N4795KFCRC3',
    icon: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12.5 15H17"/>'),
    color: '#6B4FA0',
    platform: 'Windows',
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
    id: 'todo-md',
    name: 'TODO.md',
    tagline: {
      ko: '여러 프로젝트를 오가며 쓰는 화면 가장자리 할 일 띠 — 시각 메모와 주간 보고까지.',
      en: 'A to-do strip docked to the screen edge for juggling several projects, with notes and weekly reports.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9NLK1K3WVK8F',
    icon: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 9l1.6 1.6 3.2-3.2M8.5 15h7"/>'),
    color: '#2563EB',
    platform: 'Windows',
  },
  {
    id: 'pulsardock',
    name: 'PulsarDock',
    tagline: {
      ko: '즐겨찾기와 타이머를 한곳에 — 커서·독·위젯에서 부르는 런처.',
      en: 'Favorites and timers in one place, summoned from your cursor, a dock or a widget.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9NLVDQ785190',
    icon: svg('<circle cx="12" cy="12" r="2.6"/><path d="M12 4a8 8 0 1 1-7.4 5"/><circle cx="4.6" cy="9" r="1.3"/>'),
    color: '#3A6FD8',
    platform: 'Windows',
  },
  {
    id: 'queuey',
    name: { ko: 'Queuey(큐이)', en: 'Queuey' },
    tagline: {
      ko: '작업 중 떠오른 질문과 할 일을 줄 세워 두는 픽셀 짐꾼 위젯.',
      en: 'A pixel porter widget that lines up the questions and to-dos that come up while you work.',
    },
    kind: 'desktop',
    status: 'live',
    url: 'https://apps.microsoft.com/detail/9PNV73XF9B4N',
    icon: svg('<rect x="3" y="11" width="5" height="5" rx="1"/><rect x="9.5" y="11" width="5" height="5" rx="1"/><rect x="16" y="11" width="5" height="5" rx="1"/><path d="M3 19.5h18M5.5 11V8.5M12 11V7.5M18.5 11V8.5"/>'),
    color: '#A0632B',
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

/** Link target for a language: `<url>/<lang>/` when the product has localePaths, else `url`. */
export function productUrl(p: Product, lang: CatalogLang): string {
  return p.localePaths ? `${p.url.replace(/\/+$/, '')}/${lang}/` : p.url;
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
    return `<li ${attrs}><a href="${escapeHtml(productUrl(p, lang))}" title="${title}">${name}</a>${note}</li>`;
  });
  if (opts.hubLink !== false) {
    lis.push(`<li class="${cls}__item ${cls}__hub"><a href="${BRAND.url}/${lang}/">${copy.all}</a></li>`);
  }
  const aria = tag === 'nav' ? ` aria-label="${escapeHtml(label)}"` : '';
  return `<${tag} class="${cls}"${aria}><span class="${cls}__label">${escapeHtml(label)}</span> <ul class="${cls}__list">${lis.join('')}</ul></${tag}>`;
}
