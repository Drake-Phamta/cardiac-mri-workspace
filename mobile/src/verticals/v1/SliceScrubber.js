/*
 * Slice navigation: a slider track plus step buttons (`10` §3 "swipe/slider
 * slice navigation"). The track maps a finger position to a slice through
 * scrubIndex() - the same x always gives the same slice, both ends are
 * reachable (TC-MRI-002). Every change is reported; the screen's serial
 * runner coalesces a fast scrub into "the slice in flight, then the last".
 *
 * React Native core has no Slider, and a dependency for one track is not
 * worth it: a View and a PanResponder are the whole component.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { color, font, MIN_TOUCH, space } from '../../ui/theme';
import { scrubIndex, scrubPosition, sliceLabel } from './explorer.mjs';

export default function SliceScrubber({ index, pending, total, onChange, onLongPressLabel, disabled = false }) {
  const [width, setWidth] = useState(0);
  const last = useRef(null);
  const widthRef = useRef(0);
  const totalRef = useRef(total);
  totalRef.current = total;

  const emit = useCallback((x) => {
    const i = scrubIndex(x, widthRef.current, totalRef.current);
    if (i === null || i === last.current) return;
    last.current = i;
    onChange(i);
  }, [onChange]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => { last.current = null; emit(evt.nativeEvent.locationX); },
    onPanResponderMove: (evt, g) => { emit(g.moveX - (evt.nativeEvent.pageX - evt.nativeEvent.locationX)); },
    onPanResponderRelease: () => { last.current = null; },
    onPanResponderTerminate: () => { last.current = null; },
  }), [disabled, emit]);

  const shown = pending !== null && pending !== undefined ? pending : index;
  const thumb = Number.isInteger(shown) && total ? scrubPosition(shown, width, total) : 0;
  const step = (d) => {
    if (!Number.isInteger(shown) || !total) return;
    const next = Math.max(0, Math.min(total - 1, shown + d));
    if (next !== shown) onChange(next);
  };

  return (
    <View style={s.root}>
      <TouchableOpacity onLongPress={onLongPressLabel} delayLongPress={800} activeOpacity={0.8} accessibilityRole="text">
        <Text style={s.label}>
          {sliceLabel(index, total)}
          {pending !== null && pending !== undefined && pending !== index ? `   → ${pending + 1} loading…` : ''}
        </Text>
      </TouchableOpacity>
      <View style={s.row}>
        <Btn label="−10" onPress={() => step(-10)} disabled={disabled} />
        <Btn label="◀" onPress={() => step(-1)} disabled={disabled} />
        <View
          style={s.track}
          onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
          {...responder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel={sliceLabel(index, total)}
        >
          <View style={s.rail} pointerEvents="none" />
          {width > 0 && total ? <View style={[s.thumb, { left: thumb - 10 }]} pointerEvents="none" /> : null}
        </View>
        <Btn label="▶" onPress={() => step(1)} disabled={disabled} />
        <Btn label="+10" onPress={() => step(10)} disabled={disabled} />
      </View>
    </View>
  );
}

function Btn({ label, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[s.btn, disabled && s.btnD]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={s.btnT}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { marginTop: space.s },
  label: { color: color.text, fontFamily: font.mono, fontSize: font.body, textAlign: 'center', marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  track: { flex: 1, height: MIN_TOUCH, justifyContent: 'center' },
  rail: { height: 6, borderRadius: 3, backgroundColor: color.border },
  thumb: {
    position: 'absolute', top: (MIN_TOUCH - 20) / 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: color.accent, borderWidth: 2, borderColor: color.text,
  },
  btn: {
    minWidth: 44, minHeight: MIN_TOUCH, borderRadius: 8, borderWidth: 1, borderColor: color.border,
    backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  btnD: { opacity: 0.4 },
  btnT: { color: color.text, fontSize: font.body, fontWeight: '700' },
});
