/**
 * Cascaron de la aplicacion: navegacion, enrutado y montaje de vistas.
 *
 * El enrutado va por hash. En hosting compartido una ruta profunda como
 * `/variant/chr12-54578515-T-C` devuelve 404 al recargar salvo que se agregue
 * reescritura en `.htaccess`, y la restriccion del proyecto es archivos
 * estaticos y nada mas. Con hash cada estado del visor es un enlace que se
 * puede compartir y que sobrevive a la recarga en cualquier servidor.
 */

import { clear, el } from './lib/dom';
import * as fmt from './lib/format';
import {
  DataError,
  SchemaVersionError,
  loadCard,
  loadIndex,
  loadLocus,
  loadStudy,
  loadTracks,
} from './lib/data';
import { emptyState, errorState, loadingState, panel } from './lib/ui';
import { renderVariantCard } from './views/variantCard';
import { renderTissueHeatmap } from './views/tissueHeatmap';
import { renderStudy } from './views/study';
import { renderTrackBrowser } from './views/trackBrowser';
import { maybeStartTour } from './tour';
import type { IndexDoc, LocusDoc } from './lib/types';

interface Route {
  name: 'home' | 'locus' | 'variant' | 'study' | 'about';
  params: Record<string, string>;
  query: URLSearchParams;
}

let cleanup: (() => void) | null = null;
let indexDoc: IndexDoc | null = null;

function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, queryString] = raw.split('?');
  const query = new URLSearchParams(queryString ?? '');
  const parts = (path ?? '').split('/').filter(Boolean);

  if (!parts.length) return { name: 'home', params: {}, query };
  if (parts[0] === 'about') return { name: 'about', params: {}, query };
  if (parts[0] === 'locus' && parts[1]) {
    return { name: 'locus', params: { locus: parts[1] }, query };
  }
  if (parts[0] === 'variant' && parts[1] && parts[2]) {
    return {
      name: 'variant',
      params: { locus: parts[1], variant: parts[2] },
      query,
    };
  }
  if (parts[0] === 'study' && parts[1]) {
    return { name: 'study', params: { study: parts[1] }, query };
  }
  return { name: 'home', params: {}, query };
}

export function href(route: string): string {
  return `#/${route}`;
}

// --------------------------------------------------------------------------
// Paginas
// --------------------------------------------------------------------------

function renderHome(main: HTMLElement, index: IndexDoc): void {
  const loci = el(
    'ul',
    { class: 'catalog' },
    ...index.loci.map((locus) =>
      el(
        'li',
        { class: 'catalog__item' },
        el(
          'a',
          { class: 'catalog__link', href: href(`locus/${locus.id}`) },
          el('span', { class: 'catalog__name', text: locus.label }),
          el('span', {
            class: 'catalog__coords',
            text: fmt.intervalLabel(locus.chromosome, locus.start, locus.end),
          }),
          el('span', {
            class: 'catalog__detail',
            text:
              `${locus.variantCount ?? 0} variantes · ${fmt.span(
                locus.end - locus.start,
              )}`,
          }),
        ),
      ),
    ),
  );

  const studies = index.studies.length
    ? el(
        'ul',
        { class: 'catalog' },
        ...index.studies.map((study) =>
          el(
            'li',
            { class: 'catalog__item' },
            el(
              'a',
              { class: 'catalog__link', href: href(`study/${study.id}`) },
              el('span', { class: 'catalog__name', text: study.label }),
              el('span', {
                class: `status status--${study.status}`,
                text: statusLabel(study.status),
              }),
            ),
          ),
        ),
      )
    : emptyState('Todavia no hay estudios publicados.');

  main.append(
    el(
      'div',
      { class: 'hero' },
      el('h1', { class: 'hero__title', text: 'Visor de predicciones de AlphaGenome' }),
      el('p', {
        class: 'hero__lead',
        text:
          'Efectos de variante predichos por AlphaGenome, en el navegador y sin ' +
          'servidor. Los datos se congelan en un pipeline local y esta pagina ' +
          'solo lee archivos: nunca llama a la API.',
      }),
    ),
    panel(
      {
        title: 'Loci',
        subtitle: 'Cada uno con sus variantes y sus pistas de senal',
      },
      loci,
    ),
    panel(
      {
        title: 'Estudios',
        subtitle: 'Analisis que usan estos datos, con su estado declarado',
      },
      studies,
    ),
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'planned':
      return 'planificado';
    case 'running':
      return 'en curso';
    case 'positive':
      return 'resultado positivo';
    case 'null':
      return 'resultado nulo';
    case 'inconclusive':
      return 'no concluyente';
    case 'underpowered':
      return 'sin poder estadistico';
    default:
      return status;
  }
}

function renderLocus(main: HTMLElement, locus: LocusDoc): void {
  const rows = locus.variants.map((entry) =>
    el(
      'li',
      { class: 'catalog__item' },
      el(
        'a',
        {
          class: 'catalog__link',
          href: href(`variant/${locus.id}/${entry.variant.id}`),
        },
        el('span', {
          class: 'catalog__name',
          text: fmt.variantLabel(entry.variant),
        }),
        entry.variant.rsid
          ? el('span', { class: 'catalog__coords', text: entry.variant.rsid })
          : null,
        el('span', {
          class: 'catalog__detail',
          text:
            entry.aviPhred === null || entry.aviPhred === undefined
              ? 'AVI sin dato'
              : `AVI ${fmt.fixed2(entry.aviPhred)} · ${fmt.phredMeaning(entry.aviPhred)}`,
        }),
      ),
    ),
  );

  main.append(
    el(
      'div',
      { class: 'card__identity' },
      el('h1', { class: 'card__title', text: locus.label }),
      el(
        'p',
        { class: 'card__meta' },
        el('span', {
          class: 'card__chip',
          text: fmt.intervalLabel(
            locus.interval.chromosome,
            locus.interval.start,
            locus.interval.end,
          ),
        }),
        el('span', {
          class: 'card__chip card__chip--quiet',
          text: fmt.span(locus.interval.end - locus.interval.start),
        }),
        ...(locus.genes ?? []).map((gene) =>
          el('span', { class: 'card__chip', text: gene }),
        ),
      ),
    ),
    panel(
      { title: 'Variantes', subtitle: 'Elige una para ver su ficha y su mapa de calor' },
      el('ul', { class: 'catalog' }, ...rows),
    ),
  );

  const first = locus.variants[0];
  if (first) {
    main.append(
      el(
        'p',
        { class: 'notice' },
        el(
          'a',
          { href: href(`variant/${locus.id}/${first.variant.id}?view=signal`) },
          'Abrir el navegador de pistas de senal de este locus',
        ),
      ),
    );
  }
}

async function renderVariant(
  main: HTMLElement,
  index: IndexDoc,
  locusId: string,
  variantId: string,
  view: string,
): Promise<void> {
  const entry = index.loci.find((l) => l.id === locusId);
  if (!entry) {
    main.append(emptyState('Ese locus no existe en el indice.'));
    return;
  }

  const locus = await loadLocus(entry.path);
  const record = locus.variants.find((v) => v.variant.id === variantId);
  if (!record) {
    main.append(emptyState('Esa variante no esta en este locus.'));
    return;
  }

  const tabFor = (id: string, label: string) =>
    el(
      'a',
      {
        class: view === id ? 'tabs__tab is-active' : 'tabs__tab',
        href: href(`variant/${locusId}/${variantId}?view=${id}`),
        'aria-current': view === id ? 'page' : null,
      },
      label,
    );

  const tabs = el(
    'nav',
    { class: 'tabs', 'aria-label': 'Vistas de la variante' },
    tabFor('card', 'Ficha de variante'),
    tabFor('tracks', 'Tejido x modalidad'),
    tabFor('signal', 'Pistas de senal'),
    el(
      'a',
      { class: 'tabs__back', href: href(`locus/${locusId}`) },
      `← ${locus.label}`,
    ),
  );

  main.append(tabs);
  const slot = el('div', { class: 'view-slot' });
  main.append(slot);

  if (view === 'signal') {
    cleanup = renderTrackBrowser(
      slot, locus, entry.path, record.variant, record.signals,
    );
  } else if (view === 'tracks') {
    const path = record.artifacts.tracks;
    if (!path) {
      slot.append(emptyState('Esta variante no tiene mapa de calor congelado.'));
      return;
    }
    slot.append(loadingState('el mapa de calor'));
    const doc = await loadTracks(entry.path, path);
    clear(slot);
    cleanup = renderTissueHeatmap(slot, doc);
  } else {
    const path = record.artifacts.card;
    if (!path) {
      slot.append(emptyState('Esta variante no tiene ficha congelada.'));
      return;
    }
    slot.append(loadingState('la ficha de variante'));
    const doc = await loadCard(entry.path, path);
    clear(slot);
    cleanup = renderVariantCard(slot, doc);
  }
}

function renderAbout(main: HTMLElement, index: IndexDoc): void {
  main.append(
    el(
      'div',
      { class: 'card__identity' },
      el('h1', { class: 'card__title', text: 'Sobre estos datos' }),
    ),
    panel(
      { title: 'Como se produjo esto' },
      el(
        'div',
        { class: 'prose' },
        el('p', {
          text:
            'Las predicciones se consultan en local con una llave personal, se ' +
            'congelan en artefactos versionados y esta pagina solo lee esos ' +
            'archivos. La llave de AlphaGenome es personal e intransferible ' +
            'segun sus terminos de uso, asi que un sitio publico no puede ' +
            'llamar a la API en vivo. La consecuencia util es que la pagina ' +
            'carga instantanea y no consume cuota por visitante.',
        }),
        el('p', {
          text:
            'Los cuantiles del AVI se recalibraron el 18 de junio de 2026 y la ' +
            'inferencia de indels se corrigio el 14 de julio de 2026. Comparar ' +
            'artefactos de cosechas distintas no es valido, y por eso cada uno ' +
            'lleva sellada su epoca de calibracion.',
        }),
      ),
    ),
    panel(
      { title: 'Terminos' },
      el(
        'div',
        { class: 'prose' },
        el('p', {
          text:
            'Los resultados derivados de AlphaGenome estan sujetos a los ' +
            'AlphaGenome Output Terms of Use. Uso no comercial, de ' +
            'investigacion. No es un dispositivo medico, no constituye consejo ' +
            'medico y no debe usarse para decisiones clinicas.',
        }),
        el('p', {
          text:
            'Todo lo que se muestra son predicciones de un modelo, no ' +
            'mediciones experimentales.',
        }),
      ),
    ),
    panel(
      { title: 'Contrato de datos' },
      el(
        'dl',
        { class: 'facts' },
        el('dt', { text: 'Version del esquema' }),
        el('dd', { text: index.schemaVersion }),
        el('dt', { text: 'Generado' }),
        el('dd', { text: fmt.timestamp(index.generated) }),
        el('dt', { text: 'Origen' }),
        el('dd', {
          text:
            index.provenance?.source === 'synthetic'
              ? 'Fixtures sinteticas de desarrollo. No son predicciones.'
              : (index.provenance?.source ?? 'sin declarar'),
        }),
        el('dt', { text: 'Epoca de calibracion' }),
        el('dd', { text: index.provenance?.calibrationEpoch ?? 'sin declarar' }),
      ),
    ),
  );
}

// --------------------------------------------------------------------------
// Enrutado
// --------------------------------------------------------------------------

function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof SchemaVersionError) {
    return { title: 'Contrato de datos incompatible', detail: error.message };
  }
  if (error instanceof DataError) {
    // El mensaje nombra el artefacto: "no es JSON valido" sin decir CUAL es un
    // diagnostico inservible, y esa diferencia cuesta media hora.
    return {
      title: 'No se pudieron cargar los datos',
      detail: `${error.message}  (${error.url})`,
    };
  }
  return {
    title: 'Algo salio mal',
    detail: error instanceof Error ? error.message : String(error),
  };
}

async function route(): Promise<void> {
  const main = document.getElementById('main');
  if (!main) return;

  cleanup?.();
  cleanup = null;
  clear(main);
  window.scrollTo(0, 0);

  const current = parseRoute();
  main.append(loadingState('el catalogo'));

  try {
    indexDoc ??= await loadIndex();
    clear(main);

    switch (current.name) {
      case 'home':
        renderHome(main, indexDoc);
        break;
      case 'about':
        renderAbout(main, indexDoc);
        break;
      case 'locus': {
        const entry = indexDoc.loci.find((l) => l.id === current.params['locus']);
        if (!entry) {
          main.append(emptyState('Ese locus no existe en el indice.'));
          break;
        }
        main.append(loadingState(entry.label, entry.bytes));
        const locus = await loadLocus(entry.path);
        clear(main);
        renderLocus(main, locus);
        break;
      }
      case 'variant':
        await renderVariant(
          main,
          indexDoc,
          current.params['locus'] ?? '',
          current.params['variant'] ?? '',
          current.query.get('view') ?? 'card',
        );
        break;
      case 'study': {
        const entry = indexDoc.studies.find((s) => s.id === current.params['study']);
        if (!entry) {
          main.append(emptyState('Ese estudio no existe en el indice.'));
          break;
        }
        const study = await loadStudy(entry.path);
        clear(main);
        cleanup = renderStudy(main, study);
        break;
      }
    }
  } catch (error) {
    clear(main);
    const { title, detail } = describeError(error);
    main.append(errorState(title, detail, () => void route()));
  }

  maybeStartTour(current.name);
}

// --------------------------------------------------------------------------
// Tema
// --------------------------------------------------------------------------

const THEME_KEY = 'agp-theme';

function applyStoredTheme(): void {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch {
    // Ventana privada o almacenamiento bloqueado: se usa el tema del sistema.
  }
}

function toggleTheme(): void {
  const root = document.documentElement;
  const explicit = root.getAttribute('data-theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentlyDark = explicit ? explicit === 'dark' : systemDark;
  const next = currentlyDark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // El tema se pierde al recargar, pero la sesion actual funciona.
  }
}

export function start(): void {
  applyStoredTheme();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  window.addEventListener('hashchange', () => void route());
  void route();
}
