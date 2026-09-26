/**
 * i18n without a framework.
 *
 * One HTML shell per language (`/` = English, `/es/` = Spanish), generated at
 * build time by `scripts/build-shells.mjs`. Each shell carries `<html lang>`,
 * its own `<head>` (title, description, hreflang, canonical, Open Graph) and
 * the ACTIVE language's dictionary inlined as JSON. The bundle is the same
 * for both languages and carries no dictionary at all:
 *
 * - no extra network wave (the dictionary arrives with the HTML), and
 * - no bytes for the language the visitor is not reading.
 *
 * The long narrative texts (why / roadmap / references / how it is made) live
 * in a second dictionary that is a separate chunk, loaded only on those
 * routes, so they never sit on the home page's critical path.
 *
 * In `vite dev` there is no shell: the dictionaries are imported dynamically.
 * `import.meta.env.DEV` is a build-time constant, so that branch and both
 * imports disappear from the production bundle.
 *
 * Keys are flat and stable (`card.gauge.title`). Placeholders are `{name}`.
 * Plural forms live under `key.one` / `key.other` and go through `tp()`.
 */

export type Lang = 'en' | 'es';
export type Params = Record<string, string | number>;

function detectLang(): Lang {
  const declared = document.documentElement.lang;
  if (declared === 'es' || declared === 'en') {
    // In dev the template says "en"; the path decides.
    if (!import.meta.env.DEV) return declared;
  }
  return /\/es\/?$|\/es\//.test(window.location.pathname) ? 'es' : 'en';
}

export const lang: Lang = detectLang();
export const otherLang: Lang = lang === 'es' ? 'en' : 'es';

/**
 * Relative path from the current shell to the app root: `./` for the English
 * shell, `../` for `/es/`. Data and assets are resolved against it, never
 * against the domain root, so the same build works under any subfolder.
 */
export const root: string = (() => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="agp-root"]');
  if (meta?.content) return meta.content;
  return lang === 'es' ? '../' : './';
})();

let dict: Record<string, string> = {};
let narrativeLoaded = false;
let fullLoaded = false;
let fullPending: Promise<void> | null = null;

function readInline(id: string): Record<string, string> | null {
  const node = document.getElementById(id);
  if (!node?.textContent) return null;
  try {
    const parsed = JSON.parse(node.textContent) as Record<string, string> | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Must resolve before anything renders. In production it is synchronous in effect. */
export async function initI18n(): Promise<void> {
  const inline = readInline('agp-i18n');
  if (inline) {
    dict = inline;
  } else {
    // `vite dev` has no shell: load the whole dictionary up front.
    await loadFull();
  }
  document.documentElement.lang = lang;
  applyStatic(document);
}

/**
 * The shell inlines only what the home page, the header, the locus page and
 * the variant card need (see INLINE in scripts/build-shells.mjs): about 4 KB
 * gzipped instead of 11. The full dictionary is a separate chunk, requested
 * in parallel with a view's own artifact on the views that need it, and in
 * idle time after the home page paints, so later navigation never waits.
 * Idempotent; concurrent callers share one request.
 */
export function loadFull(): Promise<void> {
  if (fullLoaded) return Promise.resolve();
  fullPending ??= (async () => {
    const mod =
      lang === 'es' ? await import('./es.json') : await import('./en.json');
    // Inline keys win: they are the same text, and nothing already rendered
    // may change under the reader.
    dict = { ...((mod.default ?? mod) as Record<string, string>), ...dict };
    fullLoaded = true;
  })();
  return fullPending;
}

/** Loads the narrative dictionary (separate chunk). Idempotent. */
export async function loadNarrative(): Promise<void> {
  if (narrativeLoaded) return;
  const mod =
    lang === 'es'
      ? await import('./narrative.es.json')
      : await import('./narrative.en.json');
  Object.assign(dict, (mod.default ?? mod) as Record<string, string>);
  narrativeLoaded = true;
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/**
 * Translate a key. A missing key is a bug: it is reported on the console
 * (which `npm run verify` treats as a failure) and the key itself is shown,
 * so it is visible in screenshots instead of silently blank.
 */
export function t(key: string, params?: Params): string {
  const text = dict[key];
  if (text === undefined) {
    console.error(`i18n: missing key "${key}" (${lang})`);
    return key;
  }
  return interpolate(text, params);
}

/** True if the key exists. For optional texts (e.g. a note with no override). */
export function has(key: string): boolean {
  return dict[key] !== undefined;
}

const plural = new Intl.PluralRules(lang);

/** Plural-aware `t`: looks up `key.one` / `key.other` and passes `{n}`. */
export function tp(key: string, n: number, params?: Params): string {
  const form = plural.select(n) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}`, { n, ...params });
}

/**
 * Text that comes inside a frozen artifact (`data/dist/`), overridden by the
 * dictionary when there is an entry for its stable id.
 *
 * `data/dist/` is written by the pipeline in Spanish without accents and is
 * not touched in this phase. The dictionary holds the Spanish WITH accents
 * (identical to the artifact modulo diacritics, enforced by
 * `pipeline/tests/test_i18n.py`) and the English translation. Without an
 * entry, the artifact text is shown as is: an unknown id degrades to the
 * artifact's wording, never to an empty label.
 */
export function dataText(key: string, artifactText: string): string {
  const text = dict[key];
  return text === undefined ? artifactText : text;
}

/**
 * Fills elements marked in the HTML with `data-i18n="key"` (text) and
 * `data-i18n-attr="attr:key;attr:key"` (attributes). The build already does
 * this per shell; at runtime it only matters in `vite dev` and for nodes
 * created from HTML strings.
 */
export function applyStatic(scope: ParentNode): void {
  for (const node of scope.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset['i18n'];
    if (key && dict[key] !== undefined) node.textContent = dict[key]!;
  }
  for (const node of scope.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (node.dataset['i18nAttr'] ?? '').split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key && dict[key] !== undefined) node.setAttribute(attr, dict[key]!);
    }
  }
}

const LANG_KEY = 'agp-lang';

/** URL of the same view in the other language (the hash carries the view). */
export function otherLangHref(): string {
  const target = lang === 'es' ? `${root}` : `${root}es/`;
  return target + window.location.hash;
}

/** Remembers an explicit choice. Only a click on the toggle writes it. */
export function rememberLang(choice: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, choice);
  } catch {
    // Private window: the choice lasts only for this navigation.
  }
}
