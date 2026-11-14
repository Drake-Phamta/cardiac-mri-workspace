/*
 * Controls that float over the MRI: a vertical glass toolbar of tools (Fill / Outline / Both) and the bottom
 * panel (variant, slider, transport). Glass is a translucent fill without blur (React Native has no backdrop
 * filter); its alpha keeps t1 and t2 text at 4.5:1 even over white tissue. Position them with `style`
 * (the toolbar sits 16 dp from the right edge in the mockup); the layer chips are Chip in Controls.js.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { color, HAIRLINE, radius, size, type } from './theme';

export function FloatingToolbar({ children, label, style }) {
  return (
    <View style={[s.toolbar, style]} accessibilityLabel={label}>
      {children}
    </View>
  );
}

// One 52 dp tool: a 20 dp icon over an 11 dp label. Selected = accent on accent-soft.
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
      <Text style={[s.toolT, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// The viewer's bottom panel, pinned to the bottom edge with a hairline on top. Rows go inside as children.
export function BottomPanel({ children, style, testID }) {
  return <View style={[s.panel, style]} testID={testID}>{children}</View>;
}

const s = StyleSheet.create({
  toolbar: {
    // 3 dp padding + the 1 dp edge = the mockup's 4 dp, so each tool stays 48 dp wide.
    width: size.toolbar, padding: 3, gap: 2, borderRadius: radius.l, backgroundColor: color.glass,
    borderWidth: HAIRLINE, borderColor: color.glassEdge,
  },
  // 7 = the toolbar's 10 dp corner minus its 3 dp padding.
  tool: { height: size.tool, borderRadius: 7, alignItems: 'center', justifyContent: 'center', gap: 2 },
  toolOn: { backgroundColor: color.accentSoft },
  toolT: { ...type.micro, letterSpacing: 0 },
  // 188 dp in the mockup includes the 20 dp gesture inset, which the app's SafeAreaView already keeps free.
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: size.bottomPanel - 20,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: color.glassPanel, borderTopWidth: HAIRLINE, borderColor: color.hair,
  },
});
