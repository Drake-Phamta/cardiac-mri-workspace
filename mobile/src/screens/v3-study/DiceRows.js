// The "Median Dice · UNet vs DINOv2" rows of SCR-01: one row per data fraction (25 / 50 / 100 %) on a shared 0 to 1
// track. A pair the server judged comparable shows a UNet circle and a DINOv2 triangle on the track and both
// medians; any other pair says "Not compared" on the track and "—" for its value, never a number.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { color, family, HAIRLINE, font, size, type } from '../../components/theme';
import { trianglePath } from './view.mjs';

const LABEL_WIDTH = 72;
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
        <Text style={s.notCompared}>Not compared</Text>
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
          <Text style={s.label}>{row.label}</Text>
          <Track row={row} />
          <Text style={[s.value, { width: valueWidth }, row.fair && s.valueFair]}>
            {row.fair ? `${row.unet.toFixed(3)} · ${row.dino.toFixed(3)}` : '—'}
          </Text>
        </TouchableOpacity>
      ))}
      <View style={[s.axis, { marginRight: valueWidth + GAP }]}>
        {[['0', '0%'], ['0.5', '50%'], ['1', '100%']].map(([text, left]) => (
          <Text key={text} style={[s.axisLabel, { left }]}>{text}</Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { height: size.meterRow, flexDirection: 'row', alignItems: 'center', gap: GAP },
  rowLine: { borderTopWidth: HAIRLINE, borderColor: color.hair },
  label: { ...type.body, width: LABEL_WIDTH, fontWeight: '500', color: color.t1, fontVariant: font.numeric },
  track: { flex: 1, height: 16, justifyContent: 'center' },
  line: { position: 'absolute', left: 0, right: 0, top: 7.5, height: 1, backgroundColor: color.track },
  tick: { position: 'absolute', top: 4, width: 1, height: 8, backgroundColor: color.tick },
  notCompared: { ...type.caption, alignSelf: 'center', paddingHorizontal: 8, backgroundColor: color.bg, color: color.t3 },
  mark: { position: 'absolute', top: 1, width: MARK, height: MARK, marginLeft: -MARK / 2 },
  value: { ...type.body, textAlign: 'right', color: color.t3, fontVariant: font.numeric },
  valueFair: { color: color.t1 },
  // The 0 / 0.5 / 1 labels sit under the track: it starts after the label column and ends before the value column.
  axis: { height: 14, marginTop: 4, marginLeft: LABEL_WIDTH + GAP },
  axisLabel: { ...type.micro, position: 'absolute', top: 0, width: 24, marginLeft: -12, textAlign: 'center', color: color.t3 },
});
