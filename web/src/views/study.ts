/**
 * V6 — Paneles de estudio.
 *
 * Un estudio se DECLARA en su manifiesto: nombra tipos de vista que este modulo
 * ya sabe renderizar y les pasa datos. Agregar un estudio nuevo no debe tocar
 * este archivo. Si hay que tocarlo, la abstraccion esta mal.
 *
 * La honestidad no es un panel mas: va arriba, antes que cualquier grafico.
 * Tamano de muestra, poder, limitaciones y signo del resultado se muestran
 * siempre, y un resultado nulo se muestra con la misma prominencia que uno
 * positivo.
 */

import { el } from '../lib/dom';
import * as fmt from '../lib/format';
import { panel, emptyState, provenanceStrip, predictionNotice, sourceChip } from '../lib/ui';
import type { StudyDoc } from '../lib/types';

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planificado',
  running: 'En curso',
  positive: 'Resultado positivo',
  null: 'Resultado nulo',
  inconclusive: 'No concluyente',
  underpowered: 'Sin poder estadistico',
};

const STATUS_NOTE: Record<string, string> = {
  planned: 'El estudio aun no ha corrido. No hay resultados que mostrar.',
  running: 'El estudio esta corriendo. Los numeros pueden cambiar.',
  positive: 'Se encontro el efecto buscado, dentro de las limitaciones declaradas.',
  null: 'Se midio y no se encontro efecto. Un resultado nulo es un resultado.',
  inconclusive: 'Los datos no permiten decidir entre las hipotesis.',
  underpowered:
    'La muestra no alcanza para detectar el efecto buscado. "Medimos y no alcanzo" ' +
    'es el hallazgo, y se publica como tal.',
};

/** Bloque de honestidad. Es lo primero que se ve, a proposito. */
function honestyBlock(study: StudyDoc): HTMLElement {
  const { honesty } = study;

  const sampleRows = Object.entries(honesty.sampleSize).map(([key, value]) =>
    el(
      'div',
      { class: 'facts__pair' },
      el('dt', { text: key.replace(/_/g, ' ') }),
      el('dd', { text: typeof value === 'number' ? fmt.int(value) : String(value) }),
    ),
  );

  const power = honesty.power;
  const powerRows: HTMLElement[] = [];
  if (power) {
    powerRows.push(
      el(
        'div',
        { class: 'facts__pair' },
        el('dt', { text: 'poder alcanzado' }),
        el('dd', {
          text:
            power.achieved === null || power.achieved === undefined
              ? 'sin medir'
              : fmt.fixed2(power.achieved),
        }),
      ),
      el(
        'div',
        { class: 'facts__pair' },
        el('dt', { text: 'poder objetivo' }),
        el('dd', {
          text:
            power.target === null || power.target === undefined
              ? 'sin declarar'
              : fmt.fixed2(power.target),
        }),
      ),
      el(
        'div',
        { class: 'facts__pair' },
        el('dt', {
          text: 'unidades efectivas',
          title:
            'Haplotipos independientes, no conteo de variantes. En una poblacion ' +
            'con cuello de botella las variantes viajan juntas, y tratarlas como ' +
            'independientes es anticonservador.',
        }),
        el('dd', {
          text:
            power.effectiveUnits === null || power.effectiveUnits === undefined
              ? 'sin medir'
              : fmt.int(power.effectiveUnits),
        }),
      ),
    );
  }

  return el(
    'div',
    { class: `honesty honesty--${study.status}` },
    el(
      'div',
      { class: 'honesty__head' },
      el('span', {
        class: `status status--${study.status}`,
        text: STATUS_LABEL[study.status] ?? study.status,
      }),
      el('p', { class: 'honesty__note', text: STATUS_NOTE[study.status] ?? '' }),
    ),
    el(
      'div',
      { class: 'honesty__grid' },
      el(
        'div',
        {},
        el('h3', { class: 'honesty__subtitle', text: 'Tamano de muestra' }),
        el('dl', { class: 'facts facts--compact' }, ...sampleRows),
      ),
      powerRows.length
        ? el(
            'div',
            {},
            el('h3', { class: 'honesty__subtitle', text: 'Poder estadistico' }),
            el('dl', { class: 'facts facts--compact' }, ...powerRows),
            power?.note ? el('p', { class: 'honesty__hint', text: power.note }) : null,
          )
        : null,
    ),
    el(
      'div',
      {},
      el('h3', { class: 'honesty__subtitle', text: 'Limitaciones conocidas' }),
      el(
        'ul',
        { class: 'honesty__limits' },
        ...honesty.limitations.map((text) => el('li', { text })),
      ),
    ),
    honesty.ethics
      ? el(
          'div',
          {},
          el('h3', { class: 'honesty__subtitle', text: 'Etica y gobernanza de datos' }),
          el('p', { class: 'honesty__ethics', text: honesty.ethics }),
        )
      : null,
  );
}

/** Renderiza un panel declarado. Tipos no implementados se dicen, no se ocultan. */
function renderPanel(spec: StudyDoc['panels'][number]): HTMLElement {
  if (spec.type === 'note') {
    const data = spec.data as { body?: string };
    return panel(
      { title: spec.title, subtitle: spec.caption ?? undefined },
      el('div', { class: 'prose' }, el('p', { text: data.body ?? '' })),
    );
  }

  // Los tipos de grafico se implementan cuando un estudio real los pida. Decir
  // que falta es mejor que dibujar un cuadro vacio: el manifiesto ya declara la
  // intencion, y el visor no finge tener datos que no tiene.
  return panel(
    { title: spec.title, subtitle: spec.caption ?? undefined },
    emptyState(
      `Panel de tipo "${spec.type}" todavia sin implementar`,
      'El manifiesto ya lo declara. El visor lo dibujara cuando el estudio ' +
        'entregue sus datos.',
    ),
  );
}

export function renderStudy(container: HTMLElement, study: StudyDoc): () => void {
  const head = el(
    'div',
    { class: 'card__identity' },
    el('h1', { class: 'card__title', text: study.label }),
    el('p', { class: 'card__meta' }, sourceChip(study.provenance)),
    study.summary ? el('p', { class: 'card__lead', text: study.summary }) : null,
  );

  container.append(
    head,
    ...(study.provenance ? [provenanceStrip(study.provenance)] : []),
    panel(
      {
        title: 'Estado y limitaciones',
        subtitle: 'Se declara antes de mostrar cualquier grafico',
      },
      honestyBlock(study),
    ),
    ...study.panels.map(renderPanel),
    predictionNotice(),
  );

  return () => {};
}
