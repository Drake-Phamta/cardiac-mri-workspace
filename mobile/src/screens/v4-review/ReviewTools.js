// The drawing tools of SCR-06 as a translucent column on the right of the picture, as the viewer's draw-mode toolbar:
// Add, Erase, Pan, hold Source, then Undo and Redo. The shared FloatingToolbar, ToolButton and IconButton draw them;
// what a tap does is decided by the controller (ctl). Nothing here writes to the review.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconButton } from '../../components/Controls';
import { FloatingToolbar, ToolButton } from '../../components/Floating';
import { IconEye } from '../../components/icons';
import { color, HAIRLINE, LABEL_FONT_CAP, MIN_TOUCH, size, type } from '../../components/theme';
import { MODE, TOOL } from './reviewScreen.mjs';
import { IconBrush, IconEraser, IconMove, IconRedo, IconUndo } from './toolIcons';
import Why from './Why';

// The height of the column, from the sizes it is made of: four 52 dp tools, the 1 dp line, Undo and Redo (48 dp each), 2 dp
// between its 7 children, 3 dp padding and the 1 dp edge all round. The canvas uses it to see whether the column reaches
// the corner readout at the top right (ReviewCanvas); the dump of the phone gave 325 dp.
export const COLUMN_HEIGHT = 4 * size.tool + HAIRLINE + 2 * MIN_TOUCH + 6 * 2 + 2 * 3 + 2 * HAIRLINE;

// Press and hold to see the source prediction alone; releasing brings the edits back. It looks like a ToolButton, but
// never dims while the finger is down (a pressed TouchableOpacity fades to 20%, which read as "disabled", B6):
// activeOpacity is 1, and holding is shown by the selected colours and by "Source only" in the corner of the picture.
function HoldSource({ ctl, on, disabled }) {
  const tint = on ? color.accent : color.t2;
  return (
    <TouchableOpacity
      style={[s.tool, on && s.toolOn, disabled && s.off]}
      activeOpacity={1}
      onPressIn={() => ctl.holdSource(true)}
      onPressOut={() => ctl.holdSource(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Hold to show only the source prediction"
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(on) }}
      testID="hold-source"
    >
      <IconEye size={size.iconSmall} color={tint} />
      <Text style={[s.toolT, { color: tint }]} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP}>Source</Text>
    </TouchableOpacity>
  );
}

// A tool that cannot be used on this slice (no pixels yet) is dimmed and takes no touch.
function Dim({ off, children }) {
  return <View style={off && s.off} pointerEvents={off ? 'none' : 'auto'}>{children}</View>;
}

// style: where the column sits (the screen puts it above the bottom panel, at the right edge).
// A tool that is off says why (Why.js): in its accessibility hint, and as a one-line note when it is tapped.
export default function ToolColumn({ ctl, st, style }) {
  const b = st.brush;
  const editable = st.canEdit;
  const why = st.why;
  const say = (text) => ctl.say(text);
  const brushing = st.mode === MODE.BRUSH;
  const use = (tool) => { ctl.setTool(tool); ctl.setMode(MODE.BRUSH); };
  return (
    <FloatingToolbar label="Drawing tools" style={style}>
      <Why label="Add" reason={why.edit} say={say}>
        <Dim off={!editable}>
          <ToolButton icon={IconBrush} label="Add" selected={brushing && b.tool === TOOL.ADD} onPress={() => use(TOOL.ADD)} />
        </Dim>
      </Why>
      <Why label="Erase" reason={why.edit} say={say}>
        <Dim off={!editable}>
          <ToolButton icon={IconEraser} label="Erase" selected={brushing && b.tool === TOOL.ERASE} onPress={() => use(TOOL.ERASE)} />
        </Dim>
      </Why>
      <ToolButton icon={IconMove} label="Pan" selected={st.mode === MODE.PAN} onPress={() => ctl.setMode(MODE.PAN)} />
      <Why label="Hold to show only the source prediction" reason={why.source} say={say}>
        <HoldSource ctl={ctl} on={st.sourceOnly} disabled={!st.layers} />
      </Why>
      <View style={s.line} />
      <Why label="Undo" reason={why.undo} say={say}>
        <IconButton icon={IconUndo} label="Undo" tint={color.t1} disabled={!editable || !b.canUndo} onPress={() => ctl.undo()} />
      </Why>
      <Why label="Redo" reason={why.redo} say={say}>
        <IconButton icon={IconRedo} label="Redo" tint={color.t1} disabled={!editable || !b.canRedo} onPress={() => ctl.redo()} />
      </Why>
    </FloatingToolbar>
  );
}

const s = StyleSheet.create({
  // the Source tool: the same 52 dp tool as the shared ToolButton
  tool: { height: size.tool, borderRadius: 7, alignItems: 'center', justifyContent: 'center', gap: 2 },
  toolOn: { backgroundColor: color.accentSoft },
  // As wide as the 48 dp button, one line, capped: the same rules as the shared ToolButton (Floating.js).
  toolT: { ...type.micro, letterSpacing: 0, alignSelf: 'stretch', textAlign: 'center' },
  off: { opacity: 0.4 },
  line: { height: 1, marginHorizontal: 6, backgroundColor: color.hair },
});
