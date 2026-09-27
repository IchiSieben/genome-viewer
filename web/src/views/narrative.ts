/**
 * Paginas de texto: por que existe el visor, hoja de ruta, como esta hecho y
 * referencias.
 *
 * Todo el texto vive en `src/i18n/narrative.{es,en}.json` (un chunk aparte que
 * solo piden estas rutas) y pasa por el guardarrail de redaccion de
 * `pipeline/tests/test_i18n.py`. Aqui solo hay estructura: que parrafos van,
 * en que orden, y los identificadores de las referencias (DOI y PMID), que no
 * se traducen.
 */

import { el } from '../lib/dom';
import * as fmt from '../lib/format';
import { has, t } from '../i18n';
import { panel, sourceChip } from '../lib/ui';
import type { IndexDoc } from '../lib/types';

export type NarrativePage = 'why' | 'roadmap' | 'how' | 'references';

/** Parrafos numerados `prefix1`, `prefix2`... mientras existan. */
function paragraphs(prefix: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let i = 1; has(`${prefix}${i}`); i++) out.push(el('p', { text: t(`${prefix}${i}`) }));
  return out;
}

function header(title: string, lead: string): HTMLElement {
  return el(
    'header',
    { class: 'page-head' },
    el('h1', { class: 'page-head__title', text: title }),
    el('p', { class: 'page-head__lead', text: lead }),
  );
}

// --------------------------------------------------------------------------

function renderWhy(main: HTMLElement): void {
  main.append(
    header(t('why.title'), t('why.lead')),
    el('div', { class: 'prose prose--long', 'data-reveal': '' }, ...paragraphs('why.p')),
  );
}

const DONE = ['H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'N1', 'N2', 'N3', 'V4', 'V5', 'N6', 'N4'];
const PLANNED = ['H7', 'N7'];
const GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'];

function milestone(id: string, done: boolean): HTMLElement {
  return el(
    'li',
    { class: `milestone milestone--${done ? 'done' : 'planned'}` },
    el('span', { class: 'milestone__id', text: id }),
    el(
      'div',
      { class: 'milestone__text' },
      el('h3', { class: 'milestone__name', text: t(`roadmap.item.${id}.name`) }),
      el('p', { class: 'milestone__body', text: t(`roadmap.item.${id}.body`) }),
    ),
  );
}

function renderRoadmap(main: HTMLElement): void {
  main.append(
    header(t('roadmap.title'), t('roadmap.lead')),
    panel(
      { title: t('roadmap.done') },
      el('ol', { class: 'milestones' }, ...DONE.map((id) => milestone(id, true))),
    ),
    panel(
      { title: t('roadmap.planned'), subtitle: t('roadmap.noDates') },
      el('ol', { class: 'milestones' }, ...PLANNED.map((id) => milestone(id, false))),
    ),
    panel(
      { title: t('roadmap.gates.title'), subtitle: t('roadmap.gates.lead') },
      el(
        'ol',
        { class: 'milestones milestones--gates' },
        ...GATES.map((id) =>
          el(
            'li',
            { class: 'milestone milestone--planned' },
            el('span', { class: 'milestone__id', text: id }),
            el('p', { class: 'milestone__body', text: t(`roadmap.gate.${id}`) }),
          ),
        ),
      ),
    ),
  );
}

function renderHow(main: HTMLElement, index: IndexDoc): void {
  const section = (key: string) =>
    panel({ title: t(`how.${key}.title`) }, el('div', { class: 'prose' }, el('p', { text: t(`how.${key}.body`) })));

  const p = index.provenance;
  const undeclared = t('about.contract.undeclared');
  const facts: [string, string][] = [
    [t('how.tools.source'), p?.source ?? undeclared],
    [t('how.tools.client'), p?.clientVersion ?? undeclared],
    [t('how.tools.pipeline'), p?.pipelineVersion ?? undeclared],
    [t('how.tools.queried'), p?.queriedAt ? fmt.timestamp(p.queriedAt) : undeclared],
    [t('how.tools.epoch'), p?.calibrationEpoch ?? undeclared],
    [t('how.tools.config'), p?.configHash ?? undeclared],
    [t('about.contract.schema'), index.schemaVersion],
    [t('how.tools.assembly'), 'GRCh38'],
  ];

  main.append(
    header(t('how.title'), t('how.lead')),
    section('layers'),
    section('contract'),
    section('budget'),
    section('provenance'),
    panel(
      { title: t('how.tools.title'), subtitle: t('how.tools.lead') },
      el('dl', { class: 'facts' }, ...facts.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
    ),
  );
}

/**
 * Referencias verificadas contra PubMed el 2026-09-26 (docs/07, D-30). Cada
 * entrada tiene su cita en `ref.<id>` (identica en los dos idiomas: autores,
 * titulo y revista no se traducen) y aqui su DOI y su PMID.
 */
const REFERENCES: { group: string; id: string; doi: string; pmid: string }[] = [
  { group: 'model', id: 'avsec2026', doi: '10.1038/s41586-025-10014-0', pmid: '41606153' },
  { group: 'model', id: 'encode2020', doi: '10.1038/s41586-020-2493-4', pmid: '32728249' },
  { group: 'model', id: 'zoonomia2023', doi: '10.1126/science.abn3943', pmid: '37104599' },
  { group: 'model', id: 'sasse2023', doi: '10.1038/s41588-023-01524-6', pmid: '38036778' },
  { group: 'model', id: 'huang2023', doi: '10.1038/s41588-023-01574-w', pmid: '38036790' },
  { group: 'ancestry', id: 'sun2026', doi: '10.64898/2026.06.22.730889', pmid: '42395544' },
  { group: 'ancestry', id: 'hoffing2026', doi: '10.64898/2026.02.14.705914', pmid: '41756911' },
  { group: 'ancestry', id: 'pejaver2022', doi: '10.1016/j.ajhg.2022.10.013', pmid: '36413997' },
  { group: 'ancestry', id: 'martin2017', doi: '10.1016/j.ajhg.2017.03.004', pmid: '28366442' },
  { group: 'ancestry', id: 'zhu2026', doi: '10.1093/gbe/evag164', pmid: '42402195' },
  { group: 'loci', id: 'musunuru2010', doi: '10.1038/nature09266', pmid: '20686566' },
  { group: 'loci', id: 'claussnitzer2015', doi: '10.1056/NEJMoa1502214', pmid: '26287746' },
  { group: 'loci', id: 'lettice2003', doi: '10.1093/hmg/ddg180', pmid: '12837695' },
];

function renderReferences(main: HTMLElement): void {
  const groups = [...new Set(REFERENCES.map((r) => r.group))];
  main.append(
    header(t('refs.title'), t('refs.lead')),
    ...groups.map((group) =>
      panel(
        { title: t(`refs.group.${group}`) },
        el(
          'ol',
          { class: 'references' },
          ...REFERENCES.filter((r) => r.group === group).map((r) =>
            el(
              'li',
              { class: 'reference' },
              el('span', { class: 'reference__citation', text: t(`ref.${r.id}`) }),
              el(
                'span',
                { class: 'reference__links' },
                el('a', { href: `https://doi.org/${r.doi}`, rel: 'noopener', text: `doi:${r.doi}` }),
                el('a', {
                  href: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
                  rel: 'noopener',
                  text: `PMID ${r.pmid}`,
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function renderNarrative(main: HTMLElement, page: NarrativePage, index: IndexDoc): void {
  if (page === 'why') renderWhy(main);
  else if (page === 'roadmap') renderRoadmap(main);
  else if (page === 'how') renderHow(main, index);
  else renderReferences(main);
  // Como toda vista, el sello de origen de los datos de los que habla.
  main.querySelector('.page-head')?.append(el('p', { class: 'card__meta' }, sourceChip(index.provenance)));
}

/** Titulo de pestana de cada pagina de texto. */
export function narrativeTitle(page: NarrativePage): string {
  return t(page === 'references' ? 'refs.title' : `${page}.title`);
}
