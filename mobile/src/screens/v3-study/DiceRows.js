// The "Median Dice · UNet vs DINOv2" rows of SCR-01: one row per data fraction (25 / 50 / 100 %) on a shared 0 to 1
// track. A pair the server judged comparable shows a UNet circle and a DINOv2 triangle on the track and both
// medians; any other pair says "Not compared" on the track and "—" for its value, never a number.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { color, family, HAIRLINE, font, LABEL_FONT_CAP, size, type } from '../../components/theme';
import { trianglePath } from './view.mjs';

// The three tracks line up, so the label column has one width. "100 % data" is about 71 dp at 14 sp; the label stops
// growing at LABEL_FONT_CAP (1.15, about 82 dp), so 88 dp holds it at font scale 1.3 without wrapping into two lines
// that the next row's rule would cut. The value column is capped the same way.
const LABEL_WIDTH = 88;
const GAP = 16;
const VALUE_WIDTH = 40; // "—"
const VALUE_WIDTH_PAIR = 104; // "0.655 · 0.685"
const MARK = 14; // the box a marker is drawn in: 8 dp circle or 10 x 9 dp triangle, plus a 2 dp ring of the background

// A marker on the track at `value` (0 to 1): the family's shape, with a 2 dp ring of the background around it.
// part 'ring' draws only the ring, part 'shape' only the shape: Track draws both rings first, so when the two
// medians are close the DINOv2 ring does not cut into the UNet circle.
function TrackMarker({ value, group, part }) {
  const mid = MARK / 2;
  const triangle = trianglePath(mid, mid + 0.9, 4.5);
  return (
    <View style={[s.mark, { left: `${Math.max(0, Math.min(1, value)) * 100}%` }]} pointerEvents="none">
      <Svg width={MARK} height={MARK}>
        {group === 'UNET' ? (
          part === 'ring'
            ? <Circle cx={mid} cy={mid} r={6} fill={color.bg} />
            : <Circle cx={mid} cy={mid} r={4} fill={family.UNET.color} />
        ) : (
          part === 'ring'
            ? <Path d={triangle} fill={color.bg} stroke={color.bg} strokeWidth={4} strokeLinejoin="round" />
            : <Path d={triangle} fill={family.DINOV2.color} />
        )}
      </Svg>
    </View>
  );
}

// The track is 16 dp high, and every mark on it (the line, the ticks, the markers) is placed from its middle, so a taller label
// ("Not compared" at font scale 1.3 is a 20 dp line) grows the track round the same middle instead of being cut at 16 dp.
function Track({ row }) {
  return (
    <View style={s.track}>
      <View style={s.line} />
      <View style={[s.tick, { left: 0 }]} />
      <View style={[s.tick, { left: '50%' }]} />
      <View style={[s.tick, { right: 0 }]} />
      {row.fair ? (
        <>
          <TrackMarker value={row.unet} group="UNET" part="ring" />
          <TrackMarker value={row.dino} group="DINOV2" part="ring" />
          <TrackMarker value={row.unet} group="UNET" part="shape" />
          <TrackMarker value={row.dino} group="DINOV2" part="shape" />
        </>
      ) : (
        <Text style={s.notCompared} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP}>Not compared</Text>
      )}
    </View>
  );
}

// rows: diceTile(...).rows (tiles.mjs); onGo opens SCR-07 on the row's pair.
export default function DiceRows({ rows, onGo }) {
  const valueWidth = rows.some((r) => r.fair) ? VALUE_WIDTH_PAIR : VALUE_WIDTH;
  return (
    <View testID="scr01-dice">
      {rows.map((row, i) => (
        <TouchableOpacity
          key={row.id}
          style={[s.row, i > 0 && s.rowLine]}
          onPress={() => onGo(row.route)}
          hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}: ${row.chip}`}
        >
          <Text style={s.label} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP}>{row.label}</Text>
          <Track row={row} />
          <Text style={[s.value, { width: valueWidth }, row.fair && s.valueFair]} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP}>
            {row.fair ? `${row.unet.toFixed(3)} · ${row.dino.toFixed(3)}` : '—'}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={[s.axis, { marginRight: valueWidth + GAP }]}>
        {[['0', '0%'], ['0.5', '50%'], ['1', '100%']].map(([text, left]) => (
          <Text key={text} style={[s.axisLabel, { left }]} maxFontSizeMultiplier={LABEL_FONT_CAP}>{text}</Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { height: size.meterRow, flexDirection: 'row', alignItems: 'center', gap: GAP },
  rowLine: { borderTopWidth: HAIRLINE, borderColor: color.hair },
  label: { ...type.body, width: LABEL_WIDTH, fontWeight: '500', color: color.t1, fontVariant: font.numeric },
  // minHeight, not height: the label ("Not compared") loses the tail of its "p" when a fixed 16 dp box is smaller than its line.
  // The marks sit at 50 % less half their own height, so they stay on the middle whatever the track's height.
  track: { flex: 1, minHeight: 16, justifyContent: 'center' },
  line: { position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -0.5, height: 1, backgroundColor: color.track },
  tick: { position: 'absolute', top: '50%', marginTop: -4, width: 1, height: 8, backgroundColor: color.tick },
  notCompared: { ...type.caption, alignSelf: 'center', paddingHorizontal: 8, backgroundColor: color.bg, color: color.t3 },
  mark: { position: 'absolute', top: '50%', marginTop: -MARK / 2, width: MARK, height: MARK, marginLeft: -MARK / 2 },
  value: { ...type.body, textAlign: 'right', color: color.t3, fontVariant: font.numeric },
  valueFair: { color: color.t1 },
  // The 0 / 0.5 / 1 labels sit under the track: it starts after the label column and ends before the value column.
  axis: { height: 14, marginTop: 4, marginLeft: LABEL_WIDTH + GAP },
  axisLabel: { ...type.micro, position: 'absolute', top: 0, width: 24, marginLeft: -12, textAlign: 'center', color: color.t3 },
});
