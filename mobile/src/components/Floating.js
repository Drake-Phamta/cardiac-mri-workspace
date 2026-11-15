/*
 * Controls that float over the MRI: a vertical glass toolbar of tools (Fill / Outline / Both) and the bottom
 * panel (variant, slider, transport). Glass is a translucent fill without blur (React Native has no backdrop
 * filter); its alpha keeps t1 and t2 text at 4.5:1 even over white tissue. Position them with `style`
 * (the toolbar sits 16 dp from the right edge in the mockup); the layer chips are Chip in Controls.js.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { color, HAIRLINE, LABEL_FONT_CAP, radius, size, type } from './theme';

/*
 * The viewer's top scrim: black fading to clear, so the floating app bar (viewer chrome) and the corner
 * annotations read over bright tissue. A viewer-chrome screen draws it above its image and below its own
 * annotations. The mockup's fade is 152 dp from the top of the phone (92 % -> 72 % at 45 % -> 0); the status bar
 * takes the first 28 dp of it, so the app draws the remaining 124 dp, starting where that fade has reached 84 %.
 */
export const SCRIM_HEIGHT = 124;
export function TopScrim({ height = SCRIM_HEIGHT }) {
  return (
    <Svg style={s.scrim} width="100%" height={height} pointerEvents="none" testID="viewer-scrim">
      <Defs>
        <LinearGradient id="viewerScrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0.84" />
          <Stop offset="0.32" stopColor="#000000" stopOpacity="0.72" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} fill="url(#viewerScrim)" />
    </Svg>
  );
}

export function FloatingToolbar({ children, label, style }) {
  return (
    <View style={[s.toolbar, style]} accessibilityLabel={label}>
      {children}
    </View>
  );
}

// One 52 dp tool: a 20 dp icon over an 11 dp label. Selected = accent on accent-soft. The label is as wide as the
// 48 dp button (alignSelf stretch in toolT), not sized to its own text: at 320 and 480 dp on the A17 a box sized to the
// text lost its last letters to a wrapped line ("Outlin", "Bot"). It stays on one line and stops growing at
// LABEL_FONT_CAP, so "Outline" fits 48 dp at font scale 1.3.
export function ToolButton({ icon: Icon, label, selected = false, onPress, testID }) {
  const tint = selected ? color.accent : color.t2;
  return (
    <TouchableOpacity
      style={[s.tool, selected && s.toolOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      testID={testID}
    >
      <Icon size={size.iconSmall} color={tint} />
      <Text style={[s.toolT, { color: tint }]} numberOfLines={1} maxFontSizeMultiplier={LABEL_FONT_CAP}>{label}</Text>
    </TouchableOpacity>
  );
}

// The viewer's bottom panel, pinned to the bottom edge with a hairline on top. Rows go inside as children.
export function BottomPanel({ children, style, testID }) {
  return <View style={[s.panel, style]} testID={testID}>{children}</View>;
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0 },
  toolbar: {
    // 3 dp padding + the 1 dp edge = the mockup's 4 dp, so each tool stays 48 dp wide.
    width: size.toolbar, padding: 3, gap: 2, borderRadius: radius.l, backgroundColor: color.glass,
    borderWidth: HAIRLINE, borderColor: color.glassEdge,
  },
  // 7 = the toolbar's 10 dp corner minus its 3 dp padding.
  tool: { height: size.tool, borderRadius: 7, alignItems: 'center', justifyContent: 'center', gap: 2 },
  toolOn: { backgroundColor: color.accentSoft },
  toolT: { ...type.micro, letterSpacing: 0, alignSelf: 'stretch', textAlign: 'center' },
  // 188 dp in the mockup includes the 20 dp gesture inset, which the app's SafeAreaView already keeps free.
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: size.bottomPanel - 20,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: color.glassPanel, borderTopWidth: HAIRLINE, borderColor: color.hair,
  },
});
