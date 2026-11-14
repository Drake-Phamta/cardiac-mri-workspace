// The bottom panel of SCR-05 in the viewer language (BottomPanel of the shared components): which prediction is on
// screen and the selected slice as "Slice 45 / 88", then what the selection is in words (an error region with its
// size, a picked point of the surface, or a hint), and Open in 2D. What to say comes from inspector3d.mjs
// (selectionPanel); the slice number from lib/sliceNumber.mjs. Ids, checksums and mesh sizes are not here: the
// shell's Details sheet has them (the screen reports them with nav.setContext).
// The panel floats over the bottom of the page and tells its height, so the page keeps its tools above it.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import CapabilityBadge from '../../components/CapabilityBadge';
import { Button } from '../../components/Controls';
import { BottomPanel } from '../../components/Floating';
import { IconInfo } from '../../components/icons';
import { color, font, space, type } from '../../components/theme';
import { sliceParts } from '../../lib/sliceNumber.mjs';
import { MARKER_COLOR, VARIANT_LABEL } from './inspector3d.mjs';

// FN is a round dot and FP a square, as on the surface, so the class never depends on colour alone.
function Glyph({ cls }) {
  return <View style={[s.glyph, cls === 'FP' && s.glyphSquare, { backgroundColor: MARKER_COLOR[cls] }]} />;
}

export default function SelectionPanel({
  variant, capability, band, total, content, summary, notices, openLabel, canOpen, onOpen, onHeight,
}) {
  const slice = sliceParts(band, total);
  return (
    <View style={s.dock} onLayout={(e) => onHeight(e.nativeEvent.layout.height)} pointerEvents="box-none" testID="selection-dock">
      <BottomPanel style={s.panel} testID="selection-panel">
        <View style={s.top}>
          <View style={s.what}>
            <Text style={s.label} numberOfLines={1}>{`Prediction · ${VARIANT_LABEL[variant] || variant}`}</Text>
            <CapabilityBadge capability={capability} />
          </View>
          <Text style={s.readout} testID="slice-readout">
            <Text style={s.readoutLabel}>Slice </Text>
            <Text style={s.readoutNow}>{slice.current}</Text>
            <Text style={s.readoutLabel}>{` / ${slice.total}`}</Text>
          </Text>
        </View>

        <View style={s.body} accessibilityLiveRegion="polite">
          {content.title ? (
            <View style={s.titleRow}>
              {content.cls ? <Glyph cls={content.cls} /> : null}
              <Text style={s.title}>{content.title}</Text>
            </View>
          ) : null}
          <Text style={s.meaning}>{content.meaning}</Text>
          {content.facts.length ? <Text style={s.facts}>{content.facts.join(' · ')}</Text> : null}
          {content.kind === 'none' && summary ? <Text style={s.facts}>{summary}</Text> : null}
          {content.kind === 'none' ? notices.map((n) => (
            <View key={n} style={s.notice}>
              <IconInfo size={16} strokeWidth={2} color={color.t2} />
              <Text style={s.noticeT}>{n}</Text>
            </View>
          )) : null}
        </View>

        <Button label="Open in 2D" accessibilityLabel={openLabel} disabled={!canOpen} onPress={onOpen} block testID="open-in-2d" />
      </BottomPanel>
    </View>
  );
}

const s = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // The shared BottomPanel pins itself to the bottom edge of its parent; the dock is that parent and measures it.
  panel: { position: 'relative', gap: space.m },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.m },
  what: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 1 },
  label: { ...type.body, color: color.t2, flexShrink: 1 },
  readout: { ...type.readout, color: color.t1 },
  readoutLabel: { fontSize: font.body, fontWeight: '400', color: color.t2 },
  readoutNow: { fontSize: 22, lineHeight: 26, fontWeight: '600', color: color.t1, fontVariant: font.numeric },
  body: { gap: space.xs, minHeight: 64 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  title: { ...type.title, color: color.t1, flexShrink: 1 },
  meaning: { ...type.body, color: color.t2 },
  facts: { ...type.secondary, color: color.t2, fontVariant: font.numeric },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.xs },
  noticeT: { ...type.secondary, color: color.t2, flex: 1 },
  glyph: { width: 12, height: 12, borderRadius: 6 },
  glyphSquare: { borderRadius: 2 },
});
