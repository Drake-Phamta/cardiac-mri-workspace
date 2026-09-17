/*
 * Small, dependency-free frame probe for the SPIKE_B diagnostic viewer.
 *
 * It records requestAnimationFrame intervals after a warm-up period.  It is
 * intentionally a raw measurement aid: an exported result still needs the
 * physical device, browser and operator provenance described in
 * MEASUREMENT_B10_B11.md before it can support a Day 08 decision.
 */

export const DEFAULT_WARMUP_MS = 3_000;
export const DEFAULT_MEASURE_MS = 30_000;
export const STALL_BOUND_MS = 500;

function finitePositive(values) {
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

// Nearest-rank percentile makes the rule easy to reproduce in a spreadsheet.
export function nearestRank(sortedValues, percentile) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new Error('percentile must be between 0 and 1');
  }
  const index = Math.max(0, Math.ceil(percentile * sortedValues.length) - 1);
  return sortedValues[index];
}

export function summarizeFrameIntervals(intervals) {
  const accepted = finitePositive(intervals).sort((a, b) => a - b);
  if (accepted.length === 0) return null;
  const medianFrameIntervalMs = nearestRank(accepted, 0.5);
  const p95FrameIntervalMs = nearestRank(accepted, 0.95);
  const longestStallMs = accepted[accepted.length - 1];
  return {
    sample_count: accepted.length,
    median_frame_interval_ms: medianFrameIntervalMs,
    p95_frame_interval_ms: p95FrameIntervalMs,
    median_fps: 1_000 / medianFrameIntervalMs,
    p05_fps: 1_000 / p95FrameIntervalMs,
    longest_stall_ms: longestStallMs,
    frames_over_500ms: accepted.filter((interval) => interval > STALL_BOUND_MS).length,
  };
}

export class FrameProbe {
  constructor({ startedAt, warmupMs = DEFAULT_WARMUP_MS, measureMs = DEFAULT_MEASURE_MS } = {}) {
    if (!Number.isFinite(startedAt)) throw new Error('startedAt is required');
    if (!(warmupMs >= 0) || !(measureMs > 0)) throw new Error('invalid timing window');
    this.startedAt = startedAt;
    this.warmupMs = warmupMs;
    this.measureMs = measureMs;
    this.measurementStartAt = startedAt + warmupMs;
    this.endsAt = this.measurementStartAt + measureMs;
    this.previousAt = null;
    this.intervals = [];
    this.completed = false;
  }

  record(frameAt) {
    if (this.completed || !Number.isFinite(frameAt)) return null;
    // Attribute an interval to the window in which it started.  This retains a
    // stall that starts before the end but delivers its next animation frame
    // after the nominal deadline; otherwise B11 could incorrectly miss a
    // final long freeze.
    if (this.previousAt !== null && this.previousAt >= this.measurementStartAt && this.previousAt < this.endsAt) {
      this.intervals.push(frameAt - this.previousAt);
    }
    this.previousAt = frameAt;
    if (frameAt >= this.endsAt) {
      this.completed = true;
      return this.result();
    }
    return null;
  }

  result() {
    const summary = summarizeFrameIntervals(this.intervals);
    return {
      measurement: 'requestAnimationFrame diagnostic frame intervals',
      status: summary ? 'complete' : 'insufficient_samples',
      warmup_ms: this.warmupMs,
      requested_measurement_ms: this.measureMs,
      observed_elapsed_ms: this.previousAt === null ? 0 : this.previousAt - this.startedAt,
      ...summary,
      raw_frame_intervals_ms: [...this.intervals],
    };
  }
}
