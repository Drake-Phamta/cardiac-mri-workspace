/*
 * An experiment as people name it: "DINOv2 100 %". The id (EXP-D-100) belongs in the Details sheet only: no app bar,
 * picker or list row shows it. The names are the experiment matrix of spec 08 section 2; an id outside it is shown as
 * it is, because it is all there is. Shared by the screens (a screen folder never imports another one).
 */

const EXPERIMENT_NAMES = Object.freeze({
  'EXP-U-025': Object.freeze({ family: 'UNet', fractionPct: 25, lane: 'RAW' }),
  'EXP-U-050': Object.freeze({ family: 'UNet', fractionPct: 50, lane: 'RAW' }),
  'EXP-U-100': Object.freeze({ family: 'UNet', fractionPct: 100, lane: 'RAW' }),
  'EXP-D-025': Object.freeze({ family: 'DINOv2', fractionPct: 25, lane: 'RAW' }),
  'EXP-D-050': Object.freeze({ family: 'DINOv2', fractionPct: 50, lane: 'RAW' }),
  'EXP-D-100': Object.freeze({ family: 'DINOv2', fractionPct: 100, lane: 'RAW' }),
  // Post-processed from the same raw predictions as EXP-D-100.
  'EXP-D-PP': Object.freeze({ family: 'DINOv2', fractionPct: 100, lane: 'PROCESSED' }),
});

// { family, fractionPct, lane } for an id of the matrix, else null (no name is looked up on the object prototype).
export const namedExperiment = (experimentId) => (
  typeof experimentId === 'string' && Object.prototype.hasOwnProperty.call(EXPERIMENT_NAMES, experimentId)
    ? EXPERIMENT_NAMES[experimentId] : null);

// "DINOv2 100 %": the name alone, for a place that shows the variant beside it (an app bar over a variant switch).
export function experimentName(experimentId) {
  const named = namedExperiment(experimentId);
  return named ? `${named.family} ${named.fractionPct} %` : String(experimentId);
}
