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
import { t, has, dataText } from '../i18n';
import type { StudyDoc } from '../lib/types';

/** Bloque de honestidad. Es lo primero que se ve, a proposito. */
function honestyBlock(study: StudyDoc): HTMLElement {
  const { honesty } = study;

  const sampleRows = Object.entries(honesty.sampleSize).map(([key, value]) => {
    const labelKey = `study.sampleSize.${key}`;
    const label = has(labelKey) ? t(labelKey) : key.replace(/_/g, ' ');
    return el(
      'div',
      { class: 'facts__pair' },
      el('dt', { text: label }),
      el('dd', { text: typeof value === 'number' ? fmt.int(value) : String(value) }),
    );
  });

  const power = honesty.power;
  const powerRows: HTMLElement[] = [];
  if (power) {
    powerRows.push(
      el(
        'div',
        { class: 'facts__pair' },
        el('dt', { text: t('study.power.achieved') }),
        el('dd', {
          text:
            power.achieved === null || power.achieved === undefined
              ? t('study.power.notMeasured')
              : fmt.fixed2(power.achieved),
        }),
      ),
      el(
        'div',
        { class: 'facts__pair' },
        el('dt', { text: t('study.power.target') }),
        el('dd', {
          text:
            power.target === null || power.target === undefined
              ? t('study.power.notDeclared')
              : fmt.fixed2(power.target),
        }),
      ),
      el(
        'div',
        { class: 'facts__pair' },
        el('dt', {
          text: t('study.power.effectiveUnits'),
          title: t('study.power.effectiveUnits.tooltip'),
        }),
        el('dd', {
          text:
            power.effectiveUnits === null || power.effectiveUnits === undefined
              ? t('study.power.notMeasured')
              : fmt.int(power.effectiveUnits),
        }),
      ),
    );
  }

  const powerNote = power?.note
    ? dataText(`data.study.${study.id}.power.note`, power.note)
    : undefined;

  return el(
    'div',
    { class: `honesty honesty--${study.status}` },
    el(
      'div',
      { class: 'honesty__head' },
      el('span', {
        class: `status status--${study.status}`,
        text: has(`study.status.${study.status}`) ? t(`study.status.${study.status}`) : study.status,
      }),
      el('p', {
        class: 'honesty__note',
        text: has(`study.statusNote.${study.status}`) ? t(`study.statusNote.${study.status}`) : '',
      }),
    ),
    el(
      'div',
      { class: 'honesty__grid' },
      el(
        'div',
        {},
        el('h3', { class: 'honesty__subtitle', text: t('study.heading.sampleSize') }),
        el('dl', { class: 'facts facts--compact' }, ...sampleRows),
      ),
      powerRows.length
        ? el(
            'div',
            {},
            el('h3', { class: 'honesty__subtitle', text: t('study.heading.power') }),
            el('dl', { class: 'facts facts--compact' }, ...powerRows),
            powerNote ? el('p', { class: 'honesty__hint', text: powerNote }) : null,
          )
        : null,
    ),
    el(
      'div',
      {},
      el('h3', { class: 'honesty__subtitle', text: t('study.heading.limitations') }),
      el(
        'ul',
        { class: 'honesty__limits' },
        ...honesty.limitations.map((text, i) =>
          el('li', { text: dataText(`data.study.${study.id}.limitations.${i}`, text) }),
        ),
      ),
    ),
    honesty.ethics
      ? el(
          'div',
          {},
          el('h3', { class: 'honesty__subtitle', text: t('study.heading.ethics') }),
          el('p', {
            class: 'honesty__ethics',
            text: dataText(`data.study.${study.id}.ethics`, honesty.ethics),
          }),
        )
      : null,
  );
}

/** Renderiza un panel declarado. Tipos no implementados se dicen, no se ocultan. */
function renderPanel(study: StudyDoc, spec: StudyDoc['panels'][number]): HTMLElement {
  const title = dataText(`data.study.${study.id}.panel.${spec.id}.title`, spec.title);

  if (spec.type === 'note') {
    const data = spec.data as { body?: string };
    const body = dataText(`data.study.${study.id}.panel.${spec.id}.body`, data.body ?? '');
    return panel(
      { title, subtitle: spec.caption ?? undefined },
      el('div', { class: 'prose' }, el('p', { text: body })),
    );
  }

  // Los tipos de grafico se implementan cuando un estudio real los pida. Decir
  // que falta es mejor que dibujar un cuadro vacio: el manifiesto ya declara la
  // intencion, y el visor no finge tener datos que no tiene.
  return panel(
    { title, subtitle: spec.caption ?? undefined },
    emptyState(
      t('study.panel.unimplemented.title', { type: spec.type }),
      t('study.panel.unimplemented.detail'),
    ),
  );
}

export function renderStudy(container: HTMLElement, study: StudyDoc): () => void {
  const head = el(
    'div',
    { class: 'card__identity' },
    el('h1', {
      class: 'card__title',
      text: dataText(`data.study.${study.id}.label`, study.label),
    }),
    el('p', { class: 'card__meta' }, sourceChip(study.provenance)),
    study.summary
      ? el('p', {
          class: 'card__lead',
          text: dataText(`data.study.${study.id}.summary`, study.summary),
        })
      : null,
  );

  container.append(
    head,
    ...(study.provenance ? [provenanceStrip(study.provenance)] : []),
    panel(
      {
        title: t('study.panel.status.title'),
        subtitle: t('study.panel.status.subtitle'),
      },
      honestyBlock(study),
    ),
    ...study.panels.map((spec) => renderPanel(study, spec)),
    predictionNotice(),
  );

  return () => {};
}
