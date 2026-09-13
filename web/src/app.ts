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
} from './lib/ui';
import { aviGauge, renderVariantCard } from './views/variantCard';
import { renderTissueHeatmap } from './views/tissueHeatmap';
import { renderStudy } from './views/study';
import { renderTrackBrowser } from './views/trackBrowser';
import { renderSaturationMap } from './views/saturationMap';
import { renderContactDiff } from './views/contactDiff';
import { renderSpliceSashimi } from './views/spliceSashimi';
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
    el('p', { class: 'hero__waiting', text: 'Cargando la variante...' }),
  );

  const node = el(
    'section',
    { class: 'hero__featured' },
    el('p', { class: 'hero__kicker', text: 'Una variante real, ya cargada' }),
    slot,
    // Una linea que es cierta con cualquier score. La lectura del numero la da
    // el propio medidor, derivada del cuantil; repetirla aqui a mano seria la
    // forma mas facil de que la portada envejezca diciendo algo falso.
    el('p', {
      class: 'hero__note',
      text:
        'El score situa a la variante entre todas las del genoma. Es una ' +
        'prediccion de efecto regulatorio, no un diagnostico.',
    }),
    el(
      'div',
      { class: 'hero__actions' },
      el(
        'a',
        { class: 'button', href: href(variantRoute) },
        'Ver la ficha completa',
      ),
      featured.saturation
        ? el(
            'a',
            {
              class: 'button button--quiet',
              href: href(`${variantRoute}?view=saturation`),
            },
            'Mapa de saturacion',
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
      clear(slot);
      slot.append(
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
      draw(gaugeSlot.clientWidth || 480);
      stopResize = onResize(gaugeSlot, draw);
    })
    .catch(() => {
      if (cancelled) return;
      clear(slot);
      slot.append(
        el('p', {
          class: 'hero__waiting',
          text: 'La ficha no cargo. Los enlaces de abajo siguen sirviendo.',
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

  const hero = featuredHero(index);

  main.append(
    el(
      'div',
      { class: 'hero' },
      el('h1', {
        class: 'hero__title',
        text: 'Que le hace una variante al genoma, predicho',
      }),
      el('p', {
        class: 'hero__lead',
        text:
          'AlphaGenome es el modelo de DeepMind que predice como una variante ' +
          'cambia la lectura del ADN, y el Atlas de Variantes es su catalogo de ' +
          'esas predicciones ya calculadas; este visor las lee congeladas en ' +
          'archivos estaticos y nunca llama a la API.',
      }),
      ...(hero ? [hero.node] : [el('p', { class: 'card__meta' }, sourceChip(index.provenance))]),
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
    // La portada era la unica vista sin sello. Un catalogo tambien es un
    // artefacto: declara su version de esquema, su fecha y su origen.
    ...(index.provenance ? [provenanceStrip(index.provenance)] : []),
  );

  return hero ? hero.stop : undefined;
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
        sourceChip(locus.provenance),
      ),
    ),
    panel(
      { title: 'Variantes', subtitle: 'Elige una para ver su ficha y su mapa de calor' },
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
  query: URLSearchParams,
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
    ...(record.artifacts.saturation ? [tabFor('saturation', 'Mapa de saturacion')] : []),
    ...(record.artifacts.splice ? [tabFor('splice', 'Splicing (sashimi)')] : []),
    ...(record.artifacts.contact ? [tabFor('contact', 'Contactos 3D')] : []),
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
      slot.append(emptyState('Esta variante no tiene mapa de saturacion congelado.'));
      return;
    }
    slot.append(loadingState('el mapa de saturacion'));
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
      slot.append(emptyState('Esta variante no tiene sashimi de splicing congelado.'));
      return;
    }
    slot.append(loadingState('el sashimi de splicing'));
    const doc = await loadSplice(entry.path, path);
    clear(slot);
    cleanup = renderSpliceSashimi(slot, doc);
  } else if (view === 'contact') {
    const path = record.artifacts.contact;
    if (!path) {
      slot.append(emptyState('Esta variante no tiene diff de contactos congelado.'));
      return;
    }
    slot.append(loadingState('el diff de contactos 3D'));
    const doc = await loadContacts(entry.path, path);
    clear(slot);
    cleanup = renderContactDiff(slot, doc);
  } else if (view === 'tracks') {
    const path = record.artifacts.tracks;
    if (!path) {
      slot.append(emptyState('Esta variante no tiene mapa de calor congelado.'));
      return;
    }
    slot.append(loadingState('el mapa de calor'));
    const doc = await loadTracks(entry.path, path);
    clear(slot);
    cleanup = renderTissueHeatmap(slot, doc, (modality) => {
      window.location.hash =
        `/variant/${locusId}/${variantId}?view=signal&tracks=${modality}`;
    });
  } else {
    const path = record.artifacts.card;
    if (!path) {
      slot.append(emptyState('Esta variante no tiene ficha congelada.'));
      return;
    }
    slot.append(loadingState('la ficha de variante'));
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
      el('h1', { class: 'card__title', text: 'Sobre estos datos' }),
      el('p', { class: 'card__meta' }, sourceChip(index.provenance)),
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

async function route(): Promise<void> {
  const main = document.getElementById('main');
  if (!main) return;

  cleanup?.();
  cleanup = null;
  clear(main);
  window.scrollTo(0, 0);

  const current = parseRoute();
  warmUp(current);
  main.append(loadingState('el catalogo'));

  try {
    indexDoc ??= await loadIndex();
    clear(main);

    switch (current.name) {
      case 'home':
        cleanup = renderHome(main, indexDoc) ?? null;
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
          current.query,
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
