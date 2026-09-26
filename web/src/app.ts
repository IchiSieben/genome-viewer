/**
 * Cascaron de la aplicacion: navegacion, enrutado y montaje de vistas.
 *
 * El enrutado va por hash. En hosting compartido una ruta profunda como
 * `/variant/chr12-54578515-C-T` devuelve 404 al recargar salvo que se agregue
 * reescritura en `.htaccess`, y la restriccion del proyecto es archivos
 * estaticos y nada mas. Con hash cada estado del visor es un enlace que se
 * puede compartir y que sobrevive a la recarga en cualquier servidor.
 */

import { clear, el, onResize } from './lib/dom';
import * as fmt from './lib/format';
import {
  DataError,
  SchemaVersionError,
  loadCard,
  loadIndex,
  loadAnnotations,
  loadLocus,
  loadSaturation,
  loadContacts,
  loadSplice,
  loadStudy,
  loadTracks,
} from './lib/data';
import {
  emptyState,
  errorState,
  loadingState,
  panel,
  provenanceStrip,
  rsidChip,
  sourceChip,
  miniPhred,
  viewBadges,
} from './lib/ui';
import { aviGauge, miniCascade, renderVariantCard } from './views/variantCard';
import { enterView, revealOnScroll } from './lib/motion';
import { NARRATIVE_PAGES, narrativeTitle, renderNarrative, type NarrativePage } from './views/narrative';
import { renderTissueHeatmap } from './views/tissueHeatmap';
import { renderStudy } from './views/study';
import { renderTrackBrowser } from './views/trackBrowser';
import { renderSaturationMap } from './views/saturationMap';
import { renderContactDiff } from './views/contactDiff';
import { renderSpliceSashimi } from './views/spliceSashimi';
import { maybeStartTour } from './tour';
import { dataText, loadFull, loadNarrative, otherLang, otherLangHref, rememberLang, t, tp } from './i18n';
import type { IndexDoc, LocusDoc } from './lib/types';

interface Route {
  name: 'home' | 'locus' | 'variant' | 'study' | 'about' | NarrativePage;
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
  if ((NARRATIVE_PAGES as string[]).includes(parts[0]!)) {
    return { name: parts[0] as NarrativePage, params: {}, query };
  }
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

/**
 * Reescribe el hash SIN provocar una navegacion.
 *
 * `location.hash = x` dispara `hashchange`, que vuelve a enrutar y destruye la
 * vista que acaba de publicar su estado. `history.replaceState` no lo dispara,
 * asi que la URL sigue al visor en vez de reiniciarlo.
 */
function replaceHash(hash: string): void {
  if (window.location.hash === hash) return;
  try {
    window.history.replaceState(null, '', hash);
  } catch {
    // Algunos navegadores limitan replaceState; perder el enlace compartible
    // es mejor que reiniciar la vista en cada frame.
  }
}

// --------------------------------------------------------------------------
// Paginas
// --------------------------------------------------------------------------

/**
 * El bloque de portada con una variante real ya cargada.
 *
 * El puntero lo trae `index.featured`, que el pipeline DERIVA de los propios
 * `locus.json` emitidos. La portada no elige la variante ni la lleva escrita: si
 * los datos congelados cambian, el heroe cambia con ellos, y si no hay ninguna
 * variante con mapa de saturacion el indice sale sin `featured` y esta funcion
 * devuelve `null` — la portada entonces es la de siempre, sin heroe, que es lo
 * que corresponde cuando no hay nada que ensenar.
 *
 * Los dos enlaces se construyen y quedan pulsables ANTES de que la ficha
 * cargue. Son la parte que el encargo pide ("acceso directo al mapa de
 * saturacion") y no tienen por que esperar a una descarga que puede fallar.
 *
 * Devuelve su propia limpieza: el medidor se redibuja al cambiar el ancho
 * porque `.gauge` no lleva `height: auto` y escalarlo por CSS lo aplastaria.
 */
function featuredHero(index: IndexDoc): { node: HTMLElement; stop: () => void } | null {
  const featured = index.featured;
  if (!featured) return null;

  const variantRoute = `variant/${featured.locus}/${featured.variant}`;
  const slot = el(
    'div',
    { class: 'hero__slot' },
    el('p', { class: 'hero__waiting', text: t('home.hero.loading') }),
  );

  const node = el(
    'section',
    { class: 'hero__featured' },
    el('p', { class: 'hero__kicker', text: t('home.hero.kicker') }),
    slot,
    // Una linea que es cierta con cualquier score. La lectura del numero la da
    // el propio medidor, derivada del cuantil; repetirla aqui a mano seria la
    // forma mas facil de que la portada envejezca diciendo algo falso.
    el('p', {
      class: 'hero__note',
      text: t('home.hero.note'),
    }),
    el(
      'div',
      { class: 'hero__actions' },
      el(
        'a',
        { class: 'button', href: href(variantRoute) },
        t('home.hero.openCard'),
      ),
      featured.saturation
        ? el(
            'a',
            {
              class: 'button button--quiet',
              href: href(`${variantRoute}?view=saturation`),
            },
            t('variant.tab.saturation'),
          )
        : null,
    ),
  );

  let cancelled = false;
  let stopResize: (() => void) | null = null;

  void loadCard(
    `loci/${featured.locus}/locus.json`,
    `variants/${featured.variant}/card.json`,
  )
    .then((card) => {
      if (cancelled) return;
      const gaugeSlot = el('div', { class: 'hero__gauge' });
      const cascadeSlot = el('div', { class: 'hero__cascade-plot' });
      clear(slot);
      const readout = el('div', { class: 'hero__readout' });
      slot.append(
        el(
          'div',
          { class: 'hero__grid' },
          readout,
          el(
            'figure',
            { class: 'hero__cascade' },
            el('figcaption', { class: 'hero__cascade-caption', text: t('home.hero.cascade.caption') }),
            cascadeSlot,
          ),
        ),
      );
      readout.append(
        el(
          'div',
          { class: 'hero__identity' },
          el('h2', { class: 'hero__variant', text: fmt.variantLabel(card.variant) }),
          el(
            'p',
            { class: 'card__meta' },
            rsidChip(card.variant.rsid),
            card.variant.gene
              ? el('span', { class: 'card__chip', text: card.variant.gene })
              : null,
            el('span', { class: 'card__chip card__chip--quiet', text: 'GRCh38' }),
            // Tambien aqui el sello: ninguna vista muestra un numero sin decir
            // de donde salio.
            sourceChip(card.provenance),
          ),
        ),
        gaugeSlot,
      );
      const draw = (width: number) => {
        clear(gaugeSlot);
        gaugeSlot.append(
          aviGauge(card, Math.min(Math.max(240, width), 520), { compact: true }),
        );
      };
      // ResizeObserver avisa tambien al empezar a observar, con el mismo ancho:
      // sin este filtro, la cascada recien animada se reemplazaria al instante.
      let drawn = false;
      let lastWidth = -1;
      const drawCascade = (raw: number) => {
        const width = Math.min(Math.max(280, Math.round(raw)), 560);
        if (width === lastWidth) return;
        lastWidth = width;
        clear(cascadeSlot);
        cascadeSlot.append(
          miniCascade(card, width, { animate: !drawn }),
        );
        drawn = true;
      };
      draw(gaugeSlot.clientWidth || 480);
      drawCascade(cascadeSlot.clientWidth || 480);
      const stopGauge = onResize(gaugeSlot, draw);
      const stopCascade = onResize(cascadeSlot, drawCascade);
      stopResize = () => {
        stopGauge();
        stopCascade();
      };
    })
    .catch(() => {
      if (cancelled) return;
      clear(slot);
      slot.append(
        el('p', {
          class: 'hero__waiting',
          text: t('home.hero.failed'),
        }),
      );
    });

  return {
    node,
    stop: () => {
      cancelled = true;
      stopResize?.();
    },
  };
}

/**
 * Medidor en miniatura y vistas de cada locus del catalogo de la portada.
 *
 * El indice no trae el AVI de cada variante; esta en cada `locus.json` (~2 KB
 * cada uno). Pedirlos al pintar la portada sumaria una oleada a la ruta
 * critica, asi que se piden cuando el catalogo se acerca a la ventana, que en
 * escritorio es despues del heroe. Son los mismos archivos que la vista de
 * locus pide despues: el cache de data.ts los reutiliza.
 */
function enrichCatalog(list: HTMLElement, index: IndexDoc): void {
  const fill = () => {
    for (const locus of index.loci) {
      const slot = list.querySelector<HTMLElement>(`.catalog__digest[data-locus="${locus.id}"]`);
      if (!slot) continue;
      void loadLocus(locus.path)
        .then((doc) => {
          if (!doc.variants.length || !slot.isConnected) return;
          // Con varias variantes, la de mayor AVI: la fila resume el locus.
          const scores = doc.variants
            .map((v) => v.aviPhred)
            .filter((v): v is number => typeof v === 'number');
          const artifacts = Object.assign({}, ...doc.variants.map((v) => v.artifacts));
          clear(slot);
          slot.append(viewBadges(artifacts) ?? '', miniPhred(scores.length ? Math.max(...scores) : null));
        })
        .catch(() => {
          // Sin medidor la fila sigue siendo un enlace util.
        });
    }
  };
  if (!('IntersectionObserver' in window)) {
    whenIdle(fill);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fill();
    },
    { rootMargin: '200px 0px' },
  );
  // Y nunca antes del `load`: en 3G lento, nueve peticiones compitiendo con
  // la ficha del heroe la retrasarian aunque el catalogo ya se viera.
  whenIdle(() => io.observe(list));
}

/**
 * Portada.
 *
 * Lo primero que se ve tiene que decir que es esto y por que importa sin que
 * haya que desplazarse: titulo, una frase que nombra AlphaGenome y el Atlas, y
 * una variante real con su medidor. El catalogo, que antes ocupaba ese sitio,
 * baja: un listado de loci no le dice nada a quien llega de fuera.
 *
 * Devuelve limpieza cuando hay heroe, porque su medidor observa el ancho.
 */
function renderHome(main: HTMLElement, index: IndexDoc): (() => void) | undefined {
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
            text: t('home.catalog.detail', {
              variants: tp('home.catalog.variants', locus.variantCount ?? 0),
              span: fmt.span(locus.end - locus.start),
            }),
          }),
          // Se llena al acercarse al catalogo (ver enrichCatalog). El hueco
          // tiene alto fijo: llenarlo no mueve nada.
          el('span', { class: 'catalog__digest', 'data-locus': locus.id }),
        ),
      ),
    ),
  );
  enrichCatalog(loci, index);

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
              el('span', {
                class: 'catalog__name',
                text: dataText(`data.study.${study.id}.label`, study.label),
              }),
              el('span', {
                class: `status status--${study.status}`,
                text: statusLabel(study.status),
              }),
            ),
          ),
        ),
      )
    : emptyState(t('home.studies.empty'));

  const hero = featuredHero(index);

  main.append(
    el(
      'div',
      { class: 'hero' },
      el('h1', { class: 'hero__title', text: t('home.title') }),
      el('p', { class: 'hero__lead', text: t('home.lead') }),
      ...(hero ? [hero.node] : [el('p', { class: 'card__meta' }, sourceChip(index.provenance))]),
    ),
    panel(
      { title: t('home.loci.title'), subtitle: t('home.loci.subtitle') },
      loci,
    ),
    panel(
      { title: t('home.studies.title'), subtitle: t('home.studies.subtitle') },
      studies,
    ),
    panel(
      { title: t('home.project.title'), subtitle: t('home.project.subtitle') },
      el(
        'ul',
        { class: 'catalog' },
        ...(['why', 'roadmap', 'how', 'references'] as const).map((page) =>
          el(
            'li',
            { class: 'catalog__item' },
            el(
              'a',
              { class: 'catalog__link', href: href(page) },
              el('span', {
                class: 'catalog__name',
                text: t(page === 'why' ? 'nav.why' : page === 'references' ? 'footer.refs' : `footer.${page}`),
              }),
            ),
          ),
        ),
      ),
    ),
    // La portada era la unica vista sin sello. Un catalogo tambien es un
    // artefacto: declara su version de esquema, su fecha y su origen.
    ...(index.provenance ? [provenanceStrip(index.provenance)] : []),
  );

  return hero ? hero.stop : undefined;
}

const STATUSES = ['planned', 'running', 'positive', 'null', 'inconclusive', 'underpowered'];

function statusLabel(status: string): string {
  return STATUSES.includes(status) ? t(`study.status.${status}`) : status;
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
        el(
          'span',
          { class: 'catalog__digest' },
          viewBadges(entry.artifacts),
          miniPhred(entry.aviPhred),
        ),
        entry.aviPhred === null || entry.aviPhred === undefined
          ? null
          : el('span', { class: 'catalog__detail', text: fmt.phredMeaning(entry.aviPhred) }),
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
        sourceChip(locus.provenance),
      ),
    ),
    panel(
      { title: t('locus.variants.title'), subtitle: t('locus.variants.subtitle') },
      el('ul', { class: 'catalog' }, ...rows),
    ),
    provenanceStrip(locus.provenance),
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
          t('locus.openBrowser'),
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
  query: URLSearchParams,
): Promise<void> {
  const entry = index.loci.find((l) => l.id === locusId);
  if (!entry) {
    main.append(emptyState(t('app.empty.noLocus')));
    return;
  }

  const locus = await loadLocus(entry.path);
  const record = locus.variants.find((v) => v.variant.id === variantId);
  if (!record) {
    main.append(emptyState(t('app.empty.noVariant')));
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
    { class: 'tabs', 'aria-label': t('variant.tabs.label') },
    tabFor('card', t('variant.tab.card')),
    tabFor('tracks', t('variant.tab.tracks')),
    tabFor('signal', t('variant.tab.signal')),
    ...(record.artifacts.saturation ? [tabFor('saturation', t('variant.tab.saturation'))] : []),
    ...(record.artifacts.splice ? [tabFor('splice', t('variant.tab.splice'))] : []),
    ...(record.artifacts.contact ? [tabFor('contact', t('variant.tab.contact'))] : []),
    el(
      'a',
      { class: 'tabs__back', href: href(`locus/${locusId}`) },
      `← ${locus.label}`,
    ),
  );

  main.append(tabs);
  const tabKey = ['card', 'tracks', 'signal', 'saturation', 'splice', 'contact'].includes(view)
    ? view
    : 'card';
  setTitle(`${fmt.variantLabel(record.variant)} · ${t(`variant.tab.${tabKey}`)}`);
  const slot = el('div', { class: 'view-slot' });
  main.append(slot);

  if (view === 'signal') {
    const requested = (query.get('tracks') ?? '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
    const windowText = query.get('win') ?? '';
    const [winStart, winEnd] = windowText.split('-').map(Number);

    cleanup = renderTrackBrowser(
      slot,
      locus,
      entry.path,
      record.variant,
      record.signals,
      {
        tracks: requested,
        window:
          Number.isFinite(winStart) && Number.isFinite(winEnd)
            ? { start: winStart!, end: winEnd! }
            : undefined,
        publish: ({ tracks, start, end }) => {
          const params = new URLSearchParams({ view: 'signal' });
          if (tracks.length) params.set('tracks', tracks.join(','));
          params.set('win', `${start}-${end}`);
          replaceHash(`#/variant/${locusId}/${variantId}?${params.toString()}`);
        },
      },
    );
  } else if (view === 'saturation') {
    const path = record.artifacts.saturation;
    if (!path) {
      slot.append(emptyState(t('variant.missing.saturation')));
      return;
    }
    slot.append(loadingState(t('variant.loading.saturation')));
    const [doc, notes] = await Promise.all([
      loadSaturation(entry.path, path),
      locus.annotations
        ? loadAnnotations(entry.path, locus.annotations).catch(() => null)
        : Promise.resolve(null),
    ]);
    clear(slot);
    cleanup = renderSaturationMap(slot, doc, locus, notes, (variantId) => {
      window.location.hash = `/variant/${locusId}/${variantId}?view=card`;
    });
  } else if (view === 'splice') {
    const path = record.artifacts.splice;
    if (!path) {
      slot.append(emptyState(t('variant.missing.splice')));
      return;
    }
    slot.append(loadingState(t('variant.loading.splice')));
    const doc = await loadSplice(entry.path, path);
    clear(slot);
    cleanup = renderSpliceSashimi(slot, doc);
  } else if (view === 'contact') {
    const path = record.artifacts.contact;
    if (!path) {
      slot.append(emptyState(t('variant.missing.contact')));
      return;
    }
    slot.append(loadingState(t('variant.loading.contact')));
    const doc = await loadContacts(entry.path, path);
    clear(slot);
    cleanup = renderContactDiff(slot, doc);
  } else if (view === 'tracks') {
    const path = record.artifacts.tracks;
    if (!path) {
      slot.append(emptyState(t('variant.missing.tracks')));
      return;
    }
    slot.append(loadingState(t('variant.loading.tracks')));
    const doc = await loadTracks(entry.path, path);
    clear(slot);
    cleanup = renderTissueHeatmap(slot, doc, (modality) => {
      window.location.hash =
        `/variant/${locusId}/${variantId}?view=signal&tracks=${modality}`;
    });
  } else {
    const path = record.artifacts.card;
    if (!path) {
      slot.append(emptyState(t('variant.missing.card')));
      return;
    }
    slot.append(loadingState(t('variant.loading.card')));
    const doc = await loadCard(entry.path, path);
    clear(slot);
    cleanup = renderVariantCard(slot, doc, (modality) => {
      window.location.hash =
        `/variant/${locusId}/${variantId}?view=signal&tracks=${modality}`;
    });
  }
}

function renderAbout(main: HTMLElement, index: IndexDoc): void {
  main.append(
    el(
      'div',
      { class: 'card__identity' },
      el('h1', { class: 'card__title', text: t('about.title') }),
      el('p', { class: 'card__meta' }, sourceChip(index.provenance)),
    ),
    panel(
      { title: t('about.how.title') },
      el('div', { class: 'prose' }, el('p', { text: t('about.how.p1') }), el('p', { text: t('about.how.p2') })),
    ),
    panel(
      { title: t('about.terms.title') },
      el('div', { class: 'prose' }, el('p', { text: t('about.terms.p1') }), el('p', { text: t('about.terms.p2') })),
    ),
    panel(
      { title: t('about.contract.title') },
      el(
        'dl',
        { class: 'facts' },
        el('dt', { text: t('about.contract.schema') }),
        el('dd', { text: index.schemaVersion }),
        el('dt', { text: t('about.contract.generated') }),
        el('dd', { text: fmt.timestamp(index.generated) }),
        el('dt', { text: t('about.contract.source') }),
        el('dd', {
          text:
            index.provenance?.source === 'synthetic'
              ? t('about.contract.synthetic')
              : (index.provenance?.source ?? t('about.contract.undeclared')),
        }),
        el('dt', { text: t('about.contract.epoch') }),
        el('dd', { text: index.provenance?.calibrationEpoch ?? t('about.contract.undeclared') }),
      ),
    ),
  );
}

// --------------------------------------------------------------------------
// Enrutado
// --------------------------------------------------------------------------

function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof SchemaVersionError) {
    return { title: t('app.error.schema'), detail: error.message };
  }
  if (error instanceof DataError) {
    // El mensaje nombra el artefacto: "no es JSON valido" sin decir CUAL es un
    // diagnostico inservible, y esa diferencia cuesta media hora.
    return {
      title: t('app.error.data'),
      detail: `${error.message}  (${error.url})`,
    };
  }
  return {
    title: t('app.error.unknown'),
    detail: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Arranca las descargas que la ruta va a necesitar, sin esperar al indice.
 *
 * Con 400 ms de latencia, abrir una variante costaba TRES viajes en serie:
 * index.json, luego locus.json, luego card.json. Pero las rutas de los dos
 * ultimos son parte del contrato, no un dato: `loci/<id>/locus.json` y
 * `variants/<vid>/card.json`. Se piden por convencion en paralelo con el
 * indice, y como el cache es por URL, cuando el codigo real los pide ya estan
 * en vuelo o resueltos. Si el indice dijera otra ruta, esa peticion se
 * descarta y se hace la buena: la especulacion nunca cambia lo que se muestra.
 */
function warmUp(current: Route): void {
  const locusId = current.params['locus'];
  if (!locusId) return;
  const locusPath = `loci/${locusId}/locus.json`;
  loadLocus(locusPath).catch(() => {});

  const variantId = current.params['variant'];
  if (!variantId || current.name !== 'variant') return;
  const view = current.query.get('view') ?? 'card';
  const file =
    view === 'tracks'
      ? 'tracks.json'
      : view === 'saturation'
        ? 'saturation.json'
        : view === 'splice'
          ? 'splice.json'
          : view === 'contact'
            ? 'contacts.json'
            : 'card.json';
  if (view === 'saturation') {
    loadSaturation(locusPath, `variants/${variantId}/${file}`).catch(() => {});
  } else if (view === 'splice') {
    loadSplice(locusPath, `variants/${variantId}/${file}`).catch(() => {});
  } else if (view === 'contact') {
    loadContacts(locusPath, `variants/${variantId}/${file}`).catch(() => {});
  } else if (view === 'card' || view === 'tracks') {
    // `loadCard`/`loadTracks` resuelven la ruta relativa al locus, igual que
    // hara el render; la clave de cache coincide exactamente.
    const relative = `variants/${variantId}/${file}`;
    (view === 'tracks' ? loadTracks : loadCard)(locusPath, relative).catch(() => {});
  }
}

/** Routes whose texts are not in the dictionary inlined in the shell. */
function isNarrative(name: Route['name']): name is NarrativePage {
  return (NARRATIVE_PAGES as string[]).includes(name);
}

function needsFullDictionary(current: Route): boolean {
  if (current.name === 'about' || current.name === 'study' || isNarrative(current.name)) return true;
  if (current.name !== 'variant') return false;
  const view = current.query.get('view') ?? 'card';
  return view !== 'card' && view !== 'signal';
}

/**
 * After the `load` event and then idle time: the prefetch of the full
 * dictionary must never compete with what the visitor came to see.
 */
function whenIdle(fn: () => void): void {
  const idle = () => {
    const ric = (window as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (ric) ric(fn);
    else window.setTimeout(fn, 200);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

/**
 * Per-view `<title>`. The shell ships the home title; each view refines it so
 * a shared link and a browser tab say what they point at.
 */
function setTitle(page?: string): void {
  document.title = page ? t('meta.title.page', { page }) : t('meta.title.home');
}

/**
 * The language toggle points at the SAME view in the other language: the view
 * lives in the hash, the language in the path, so the hash is carried over.
 */
function syncLangToggle(): void {
  const toggle = document.getElementById('lang-toggle') as HTMLAnchorElement | null;
  if (toggle) toggle.href = otherLangHref();
}

async function route(): Promise<void> {
  const main = document.getElementById('main');
  if (!main) return;

  cleanup?.();
  cleanup = null;
  clear(main);
  window.scrollTo(0, 0);

  const current = parseRoute();
  warmUp(current);
  // Views outside the inlined dictionary wait for the full one, requested in
  // parallel with their data (never after it: that would add a network wave).
  const fullReady = needsFullDictionary(current) ? loadFull() : Promise.resolve();
  const narrativeReady = isNarrative(current.name) ? loadNarrative() : Promise.resolve();
  main.append(loadingState(t('app.loading.catalog')));

  try {
    indexDoc ??= await loadIndex();
    await fullReady;
    await narrativeReady;
    clear(main);

    switch (current.name) {
      case 'home':
        cleanup = renderHome(main, indexDoc) ?? null;
        setTitle();
        break;
      case 'about':
        renderAbout(main, indexDoc);
        setTitle(t('about.title'));
        break;
      case 'why':
      case 'roadmap':
      case 'how':
      case 'references':
        renderNarrative(main, current.name, indexDoc);
        setTitle(narrativeTitle(current.name));
        break;
      case 'locus': {
        const entry = indexDoc.loci.find((l) => l.id === current.params['locus']);
        if (!entry) {
          main.append(emptyState(t('app.empty.noLocus')));
          break;
        }
        main.append(loadingState(entry.label, entry.bytes));
        const locus = await loadLocus(entry.path);
        clear(main);
        renderLocus(main, locus);
        setTitle(locus.label);
        break;
      }
      case 'variant':
        await renderVariant(
          main,
          indexDoc,
          current.params['locus'] ?? '',
          current.params['variant'] ?? '',
          current.query.get('view') ?? 'card',
          current.query,
        );
        break;
      case 'study': {
        const entry = indexDoc.studies.find((s) => s.id === current.params['study']);
        if (!entry) {
          main.append(emptyState(t('app.empty.noStudy')));
          break;
        }
        const study = await loadStudy(entry.path);
        clear(main);
        cleanup = renderStudy(main, study);
        setTitle(dataText(`data.study.${study.id}.label`, study.label));
        break;
      }
    }
  } catch (error) {
    clear(main);
    const { title, detail } = describeError(error);
    main.append(errorState(title, detail, () => void route()));
  }

  // Movimiento (src/lib/motion.ts): la vista nueva entra con un fundido y los
  // bloques de abajo del pliegue aparecen al llegar. Ninguno toca layout.
  enterView(main);
  revealOnScroll(main);
  syncLangToggle();
  // The tour's texts are in the full dictionary. On the home page this is also
  // the idle-time prefetch that makes the next view not wait for it.
  whenIdle(() => {
    void loadFull().then(() => {
      if (parseRoute().name === current.name) maybeStartTour(current.name);
    });
  });
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
  syncLangToggle();
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    // Only an explicit click is remembered; see the redirect in index.html.
    rememberLang(otherLang);
  });
  applyStoredTheme();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  window.addEventListener('hashchange', () => void route());
  void route();
}
