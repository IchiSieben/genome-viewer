/**
 * N4 — Comparador de dos variantes.
 *
 * Solo aritmetica sobre valores que ya se muestran en cada ficha: el AVI de
 * cada una (en la misma escala), su cascada (cada una con SU valor base: la
 * calibracion cambia de consulta a consulta, asi que las barras de una no se
 * leen con la escala de la otra), y las contribuciones por familia y por
 * rasgo con su diferencia B - A. Ni veredicto ni "mas danina": no hay
 * puntuacion de parecido.
 *
 * Carga como chunk propio, solo en `#/compare`.
 */

import '../styles/compare.css';
import { clear, el, onResize } from '../lib/dom';
import * as fmt from '../lib/format';
import { dataText, t } from '../i18n';
import { familyColor, familyLabel, FAMILY_ORDER } from '../lib/color';
import { emptyState, panel, predictionNotice, rsidChip, sourceChip } from '../lib/ui';
import { loadCard, loadLocus } from '../lib/data';
import { aviGauge, miniCascade, MINI_CASCADE_HEIGHT } from './variantCard';
import type { CardDoc, IndexDoc, LocusDoc } from '../lib/types';

/** Una variante con ficha, lista para elegir. `key` = "locus/variante". */
interface Option {
  key: string;
  locusId: string;
  locusLabel: string;
  locusPath: string;
  record: LocusDoc['variants'][number];
}

/** Cuantos rasgos por variante entran en la tabla de rasgos. */
const FEATURE_TOP = 6;

async function listOptions(index: IndexDoc): Promise<Option[]> {
  const docs = await Promise.all(
    index.loci.map((entry) =>
      loadLocus(entry.path)
        .then((doc) => ({ entry, doc }))
        .catch(() => null),
    ),
  );
  const options: Option[] = [];
  for (const item of docs) {
    if (!item) continue;
    for (const record of item.doc.variants) {
      if (!record.artifacts.card) continue;
      options.push({
        key: `${item.entry.id}/${record.variant.id}`,
        locusId: item.entry.id,
        locusLabel: item.doc.label,
        locusPath: item.entry.path,
        record,
      });
    }
  }
  return options;
}

/**
 * Pareja por defecto: lo pedido si existe; si falta B, otra alternativa de la
 * MISMA posicion (lo mas honesto de comparar), si no, otra variante del mismo
 * locus, si no, la siguiente de la lista.
 */
function defaultPair(
  options: Option[],
  a: Option | undefined,
  featuredKey: string | null,
): [Option, Option] | null {
  if (options.length < 2) return null;
  const first = a ?? options.find((o) => o.key === featuredKey) ?? options[0]!;
  const others = options.filter((o) => o.key !== first.key);
  const v = first.record.variant;
  const sibling =
    others.find(
      (o) =>
        o.locusId === first.locusId &&
        o.record.variant.chromosome === v.chromosome &&
        o.record.variant.position === v.position,
    ) ??
    others.find((o) => o.locusId === first.locusId) ??
    others[0]!;
  return [first, sibling];
}

export function compareHref(a: string, b: string): string {
  return `#/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
}

function picker(options: Option[], selected: [Option, Option]): HTMLElement {
  const select = (which: 0 | 1) => {
    const node = el('select', {
      class: 'compare-picker__select',
      'aria-label': t(which === 0 ? 'compare.pick.a' : 'compare.pick.b'),
      'data-side': which === 0 ? 'a' : 'b',
    }) as HTMLSelectElement;
    const groups = new Map<string, HTMLElement>();
    for (const option of options) {
      let group = groups.get(option.locusId);
      if (!group) {
        group = el('optgroup', { label: option.locusLabel });
        groups.set(option.locusId, group);
        node.append(group);
      }
      const v = option.record.variant;
      group.append(
        el('option', {
          value: option.key,
          text: fmt.variantLabel(v) + (v.rsid ? ` · ${v.rsid}` : ''),
          selected: option.key === selected[which].key ? true : null,
        }),
      );
    }
    node.addEventListener('change', () => {
      const a = which === 0 ? node.value : selected[0].key;
      const b = which === 1 ? node.value : selected[1].key;
      window.location.hash = compareHref(a, b).slice(1);
    });
    return node;
  };

  const swap = el('button', {
    class: 'compare-picker__swap',
    type: 'button',
    text: '⇄',
    'aria-label': t('compare.swap'),
    title: t('compare.swap'),
  });
  swap.addEventListener('click', () => {
    window.location.hash = compareHref(selected[1].key, selected[0].key).slice(1);
  });

  return el(
    'div',
    { class: 'compare-picker' },
    el('label', { class: 'compare-picker__field' }, el('span', { class: 'compare-picker__tag', text: 'A' }), select(0)),
    swap,
    el('label', { class: 'compare-picker__field' }, el('span', { class: 'compare-picker__tag', text: 'B' }), select(1)),
  );
}

function sideHeader(option: Option, tag: 'A' | 'B'): HTMLElement {
  const v = option.record.variant;
  return el(
    'header',
    { class: 'compare-side__head' },
    el('span', { class: 'compare-picker__tag', text: tag }),
    el(
      'div',
      {},
      el('h2', { class: 'compare-side__title', text: fmt.variantLabel(v) }),
      el(
        'p',
        { class: 'card__meta' },
        el('span', { class: 'card__chip', text: option.locusLabel }),
        rsidChip(v.rsid),
        el('a', {
          class: 'compare-side__open',
          href: `#/variant/${option.locusId}/${v.id}?view=card`,
          text: t('compare.open'),
        }),
      ),
    ),
  );
}

function sumByFamily(card: CardDoc): Map<string, number> {
  const sums = new Map<string, number>();
  for (const f of card.features) {
    sums.set(f.family, (sums.get(f.family) ?? 0) + f.contribution);
  }
  return sums;
}

function diffCell(a: number | undefined, b: number | undefined): HTMLElement {
  if (a === undefined || b === undefined) return el('td', { class: 'num compare-table__none', text: '—' });
  const d = b - a;
  return el('td', {
    class: 'num compare-table__diff',
    'data-sign': d > 0 ? '+' : d < 0 ? '-' : '0',
    text: fmt.signed4(d),
  });
}

function valueCell(value: number | undefined): HTMLElement {
  return value === undefined
    ? el('td', { class: 'num compare-table__none', text: '—' })
    : el('td', { class: 'num', text: fmt.signed4(value) });
}

/** Swatch and text stay on one line; the text wraps beside the swatch. */
function rowLabel(color: string, text: string): HTMLElement {
  return el(
    'span',
    { class: 'compare-table__label' },
    el('span', { class: 'compare-table__swatch', style: `background:${color}` }),
    el('span', { text }),
  );
}

function table(headers: string[], rows: HTMLElement[]): HTMLElement {
  return el(
    'div',
    { class: 'compare-table-wrap' },
    el(
      'table',
      { class: 'compare-table' },
      el(
        'thead',
        {},
        el('tr', {}, ...headers.map((h, i) => el('th', { class: i ? 'num' : null, scope: 'col', text: h }))),
      ),
      el('tbody', {}, ...rows),
    ),
  );
}

function familyTable(a: CardDoc, b: CardDoc): HTMLElement {
  const sa = sumByFamily(a);
  const sb = sumByFamily(b);
  const labels = new Map((a.featureFamilies ?? []).map((f) => [f.id, f.label]));
  const ids = FAMILY_ORDER.filter((id) => sa.has(id) || sb.has(id) || labels.has(id));
  const rows = ids.map((id) =>
    el(
      'tr',
      { class: 'compare-table__row', 'data-family': id },
      el(
        'th',
        { scope: 'row' },
        rowLabel(familyColor(id), dataText(`data.family.${id}`, labels.get(id) ?? familyLabel(id))),
      ),
      valueCell(sa.get(id) ?? 0),
      valueCell(sb.get(id) ?? 0),
      diffCell(sa.get(id) ?? 0, sb.get(id) ?? 0),
    ),
  );
  return table([t('compare.col.family'), 'A', 'B', t('compare.col.diff')], rows);
}

function featureTable(a: CardDoc, b: CardDoc): HTMLElement {
  const top = (card: CardDoc) =>
    [...card.features]
      .sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution))
      .slice(0, FEATURE_TOP)
      .map((f) => f.id);
  const ids = [...new Set([...top(a), ...top(b)])];
  const byId = (card: CardDoc) => new Map(card.features.map((f) => [f.id, f]));
  const ma = byId(a);
  const mb = byId(b);
  const size = (id: string) =>
    Math.max(Math.abs(ma.get(id)?.contribution ?? 0), Math.abs(mb.get(id)?.contribution ?? 0));
  ids.sort((x, y) => size(y) - size(x));
  const rows = ids.map((id) => {
    const feature = ma.get(id) ?? mb.get(id)!;
    return el(
      'tr',
      { class: 'compare-table__row', 'data-feature': id },
      el(
        'th',
        { scope: 'row' },
        rowLabel(familyColor(feature.family), dataText(`data.feature.${id}`, feature.label)),
      ),
      valueCell(ma.get(id)?.contribution),
      valueCell(mb.get(id)?.contribution),
      diffCell(ma.get(id)?.contribution, mb.get(id)?.contribution),
    );
  });
  return table([t('compare.col.feature'), 'A', 'B', t('compare.col.diff')], rows);
}

export async function renderCompare(
  main: HTMLElement,
  index: IndexDoc,
  query: URLSearchParams,
): Promise<() => void> {
  const options = await listOptions(index);
  const find = (key: string | null) => (key ? options.find((o) => o.key === key) : undefined);
  const askedA = query.get('a');
  const askedB = query.get('b');
  const a = find(askedA);
  const b = find(askedB);
  const featuredKey = index.featured ? `${index.featured.locus}/${index.featured.variant}` : null;
  const invalid = (askedA !== null && !a) || (askedB !== null && !b);

  const pair: [Option, Option] | null =
    a && b && a.key !== b.key ? [a, b] : defaultPair(options, a, featuredKey);

  main.append(
    el(
      'div',
      { class: 'card__identity' },
      el('h1', { class: 'card__title', text: t('compare.title') }),
      el('p', { class: 'card__meta' }, sourceChip(index.provenance)),
      el('p', { class: 'compare__lead', text: t('compare.lead') }),
    ),
  );

  if (!pair) {
    main.append(emptyState(t('compare.none')));
    return () => {};
  }
  if (invalid) main.append(emptyState(t('compare.invalid'), t('compare.invalid.detail')));

  main.append(picker(options, pair));

  const [cardA, cardB] = await Promise.all(
    pair.map((o) => loadCard(o.locusPath, o.record.artifacts.card!)),
  );

  const gaugeSlots = [el('div', { class: 'compare-side__gauge' }), el('div', { class: 'compare-side__gauge' })];
  const cascadeSlots = [
    el('div', { class: 'compare-side__cascade', style: `min-height:${MINI_CASCADE_HEIGHT}px` }),
    el('div', { class: 'compare-side__cascade', style: `min-height:${MINI_CASCADE_HEIGHT}px` }),
  ];
  const cards = [cardA!, cardB!];
  const sides = el(
    'div',
    { class: 'compare-sides' },
    ...pair.map((option, i) =>
      el(
        'section',
        { class: 'compare-side', 'data-side': i === 0 ? 'a' : 'b' },
        sideHeader(option, i === 0 ? 'A' : 'B'),
        gaugeSlots[i]!,
        cascadeSlots[i]!,
      ),
    ),
  );

  main.append(
    panel({ title: t('compare.sides.title'), hint: t('compare.sides.hint') }, sides),
    panel({ title: t('compare.family.title'), hint: t('compare.family.hint') }, familyTable(cardA!, cardB!)),
    panel({ title: t('compare.feature.title'), hint: t('compare.feature.hint') }, featureTable(cardA!, cardB!)),
    predictionNotice(),
  );

  let drawnWidth = -1;
  // The column count is CSS's call (a media query); the width of what is
  // drawn comes from the real column, never from a split computed here.
  const draw = (width: number) => {
    const sideWidth = Math.floor((sides.firstElementChild as HTMLElement | null)?.clientWidth || width);
    if (sideWidth === drawnWidth) return;
    const first = drawnWidth < 0;
    drawnWidth = sideWidth;
    cards.forEach((card, i) => {
      clear(gaugeSlots[i]!);
      clear(cascadeSlots[i]!);
      gaugeSlots[i]!.append(aviGauge(card, Math.min(Math.max(240, sideWidth), 520), { compact: true }));
      cascadeSlots[i]!.append(miniCascade(card, sideWidth, { animate: first }));
    });
  };
  const stop = onResize(sides, draw);
  draw(sides.clientWidth || 720);
  return stop;
}
