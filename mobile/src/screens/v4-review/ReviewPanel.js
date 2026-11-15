// The bottom panel of SCR-06, as the viewer's: first row the slice ("Slice 45 / 88" between a previous and a next
// button) with Reset and Save at the right, second row the brush size. B4: the buttons of the slice row are fixed
// size and share their row with nothing that can grow, so no text can push Next off the screen.
// Each row wraps: where the slice buttons, Reset and Save do not fit one row (a 320 dp screen, a large font), Reset and
// Save drop to a second line at the right, and the brush size drops under its label. Nothing is pushed past the edge,
// and the panel reports its measured height (onHeight) so the picture is fitted above it.
// A control that is off says why (Why.js): in its accessibility hint, and as a one-line note when it is tapped.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, IconButton, SegmentedControl } from '../../components/Controls';
import { BottomPanel } from '../../components/Floating';
import { IconStepBack, IconStepForward } from '../../components/icons';
import { color, HAIRLINE, space, type } from '../../components/theme';
import { sliceParts } from '../../lib/sliceNumber.mjs';
import { brushSizePx, RADII } from './brush.mjs';
import { MASK_STATE } from './reviewScreen.mjs';
import Why from './Why';

// What the panel adds round its rows: 16 dp above and below them and the 1 dp hairline on top.
const CHROME = 2 * space.l + HAIRLINE;

// A review that continues from a saved version still resets to the original prediction; the question says so.
const resetMessage = (b) => (b.baseId
  ? 'Every open slice goes back to the original prediction, not to your last saved version, and the undo history is cleared.'
  : 'Every open slice goes back to the source mask and the undo history is cleared.');

// onSave: asks "Save correction?" (the screen builds the question). ask: the screen's Cancel / OK sheet.
export default function ReviewPanel({ ctl, st, onSave, ask, onHeight = null }) {
  const b = st.brush;
  const busy = Boolean(st.busy);
  const slice = sliceParts(st.slice.index, st.slice.total);
  const sizesOff = !st.canEdit;
  const why = st.why;
  const say = (text) => ctl.say(text);
  return (
    <BottomPanel testID="viewer-panel" style={s.panel}>
      <View style={s.rows} testID="panel-rows" onLayout={(e) => { if (onHeight) onHeight(Math.round(e.nativeEvent.layout.height + CHROME)); }}>
        <View style={s.row}>
          <View style={s.nav} testID="slice-nav">
            <Why label="Previous slice" reason={why.prev} say={say}>
              <IconButton icon={IconStepBack} label="Previous slice" tint={color.t1}
                disabled={st.slice.index <= 0 || busy} onPress={() => ctl.prevSlice()} />
            </Why>
            <Text style={s.readout} testID="slice-readout">
              Slice <Text style={s.readoutN}>{slice.current}</Text> / {slice.total}
            </Text>
            <Why label="Next slice" reason={why.next} say={say}>
              <IconButton icon={IconStepForward} label="Next slice" tint={color.t1}
                disabled={st.slice.index >= st.slice.total - 1 || busy} onPress={() => ctl.nextSlice()} />
            </Why>
          </View>
          <View style={s.actions} testID="panel-actions">
            <Why label="Reset" reason={why.reset} say={say}>
              <Button label="Reset" variant="secondary"
                disabled={!st.canEdit || (b.maskState === MASK_STATE.SOURCE && !b.canRedo)}
                onPress={() => ask({
                  title: 'Reset to the source?',
                  lines: [resetMessage(b)],
                  okLabel: 'Reset',
                  onOk: () => ctl.reset(),
                })} />
            </Why>
            <Why label="Save" reason={why.save} say={say}>
              <Button label={st.busy === 'saving' ? 'Saving…' : 'Save'} disabled={!st.canSave} onPress={onSave} testID="save" />
            </Why>
          </View>
        </View>
        <View style={s.row}>
          <Text style={s.sizeLabel}>Brush size</Text>
          <View style={s.sizes}>
            <Why label="Brush size" reason={why.edit} say={say}>
              <View style={sizesOff && s.off} pointerEvents={sizesOff ? 'none' : 'auto'}>
                <SegmentedControl
                  label="Brush size, pixels across"
                  options={RADII.map((rad) => ({ value: rad, label: `${brushSizePx(rad)} px` }))}
                  value={b.radius}
                  onChange={(rad) => ctl.setRadius(rad)}
                />
              </View>
            </Why>
          </View>
        </View>
      </View>
    </BottomPanel>
  );
}

const s = StyleSheet.create({
  // The panel is as high as its rows. With nothing wrapped that is PANEL_HEIGHT: 16 + 48 + 8 + 48 + 16 + the 1 dp hairline.
  panel: { minHeight: 0, paddingTop: space.l, paddingBottom: space.l },
  rows: { gap: space.s },
  row: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: space.s, rowGap: space.s },
  nav: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  // marginLeft auto: at the right of its line, whether that is beside the slice buttons or on a line of its own.
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 0, marginLeft: 'auto' },
  readout: { ...type.body, color: color.t2, fontVariant: ['tabular-nums'], minWidth: 88, textAlign: 'center' },
  readoutN: { ...type.readout, color: color.t1 },
  sizes: { flexShrink: 0, marginLeft: 'auto' },
  off: { opacity: 0.4 },
  sizeLabel: { ...type.caption, color: color.t2 },
});
