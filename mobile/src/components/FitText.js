/*
 * One line of text that shrinks to fit a known width, decided by the app and not by the text engine (the app bar's
 * title and subtitle: Android did not apply Text adjustsFontSizeToFit, the device session of 2026-11-15, r7).
 *
 *   const fit = useFitFontSize({ text, base: 17, minScale: 0.6, available: 96, enabled: true });
 *   <Text style={[style, fit.size === null ? null : { fontSize: fit.size }]} numberOfLines={1}>{text}</Text>
 *   <FitProbe fit={fit} text={text} style={style} maxFontSizeMultiplier={cap} />
 *
 * The deciding is fitFontSize.mjs (pure). This file keeps the measured widths of the current text, lays out the hidden copy
 * the decision asks for (FitProbe: same style, no numberOfLines, in a wide box, invisible, hidden from screen readers) and
 * feeds its width back. Each copy is a new mount, so its first layout always reports. When the answer is settled no copy is
 * drawn, and nothing is measured again until the text, the width of the room or the system font size changes.
 */

import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { FIT_PROBE_WIDTH, fitFontSize, lineWidth, sizeKey } from './fitFontSize.mjs';

const NONE = Object.freeze({});
const IDLE = Object.freeze({ settled: false, size: null, fits: null, probe: null });

// size: the font size to draw (sp), or null to keep the style's own (not decided yet, not enabled, or it fits as it is).
// probe: the size the hidden copy has to be at, or null. measured(size, width) takes a measurement.
export function useFitFontSize({ text, base, minScale, available, enabled }) {
  const { fontScale } = useWindowDimensions();
  const id = `${fontScale}|${text}`;
  const [store, setStore] = useState({ id, widths: NONE });
  const widths = store.id === id ? store.widths : NONE;
  const decision = enabled ? fitFontSize({ base, minScale, available, widths }) : IDLE;
  // While a new width of the room is being measured, the line keeps the size it had for this text.
  const last = useRef({ id: null, size: null });
  if (decision.settled) last.current = { id, size: decision.size };
  const shown = decision.settled ? decision.size : (last.current.id === id ? last.current.size : null);

  const measured = useCallback((probeSize, width) => {
    setStore((cur) => {
      const prev = cur.id === id ? cur.widths : NONE;
      const key = sizeKey(probeSize);
      // The same width again changes nothing, so a repeated report cannot start another round.
      if (typeof prev[key] === 'number' && Math.abs(prev[key] - width) < 0.05) return cur;
      return { id, widths: { ...prev, [key]: width } };
    });
  }, [id]);

  // A line that fits at its own size keeps its style untouched (size null).
  return { id, size: shown === base ? null : shown, probe: decision.probe, fits: decision.fits, measured };
}

// The hidden copy of the text at fit.probe, or nothing. Put it where the visible text is, as a child of the same box:
// it is absolutely positioned, so it takes no room and moves nothing.
export function FitProbe({ fit, text, style, maxFontSizeMultiplier }) {
  if (fit.probe === null) return null;
  const size = fit.probe;
  return (
    <View
      key={`${fit.id}|${sizeKey(size)}`}
      style={s.probe}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="fit-probe"
    >
      <Text
        style={[style, { fontSize: size }]}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        onTextLayout={(e) => {
          const w = lineWidth(e && e.nativeEvent ? e.nativeEvent.lines : null);
          if (w !== null) fit.measured(size, w);
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  probe: { position: 'absolute', left: 0, top: 0, width: FIT_PROBE_WIDTH, opacity: 0 },
});
