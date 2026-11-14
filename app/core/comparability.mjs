/*
 * Experiment comparability - READER ONLY.
 *
 * `11` section 5: "The client must not label a comparison as fair/comparable
 * when this contract says false." The server decides; this module only reads
 * the decision and makes it hard to ignore.
 *
 * The failure mode this guards against is not a crash. It is a chart with two
 * bars that looks like a comparison, drawn from two experiments evaluated on
 * different populations. It renders perfectly and it is wrong, so the only
 * defence is that the reason is as easy to render as the numbers.
 */

export const VERDICT = Object.freeze({
  COMPARABLE: 'COMPARABLE',
  NOT_COMPARABLE: 'NOT_COMPARABLE',
  UNDECIDED: 'UNDECIDED',
});

/*
 * Note the middle branch. A response whose `comparable` is missing or not a
 * boolean is UNDECIDED, never comparable. Defaulting an absent flag to true is
 * how an unfair comparison gets labelled fair by a typo.
 */
export function readComparability(data) {
  const comparable = data?.comparable;
  let verdict;
  if (comparable === true) verdict = VERDICT.COMPARABLE;
  else if (comparable === false) verdict = VERDICT.NOT_COMPARABLE;
  else verdict = VERDICT.UNDECIDED;

  const population = data?.common_evaluation_population ?? null;
  return Object.freeze({
    verdict,
    comparable: verdict === VERDICT.COMPARABLE,
    reason: data?.compatibility_reason ?? null,
    commonPopulation: population,
    commonPopulationSize: Array.isArray(population) ? population.length : (population?.n ?? null),
    metricVersion: data?.metric_version ?? null,
    predictionVariant: data?.prediction_variant ?? null,
    summary: data?.summary ?? null,
  });
}

/*
 * What a screen is allowed to draw. A vertical calls this instead of writing
 * its own `if (comparable)`, so "may I show the delta between the two?" has
 * one answer in the codebase rather than one per chart.
 */
export function presentation(comparability) {
  const fair = comparability.verdict === VERDICT.COMPARABLE;
  return Object.freeze({
    mayShowSideBySide: true,          // the numbers themselves are always real
    mayShowDelta: fair,               // a difference is only meaningful if fair
    mayLabelFair: fair,
    mustShowReason: !fair,
    reason: comparability.reason
      ?? (comparability.verdict === VERDICT.UNDECIDED
        ? 'The server did not state whether these experiments are comparable.'
        : null),
  });
}
