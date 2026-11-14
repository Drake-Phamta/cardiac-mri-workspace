// The "About this data" sheet of SCR-01 and SCR-07: a full-screen page with the sections of about.mjs and one
// Close button. The Android back button closes it too.

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { color, font, MIN_TOUCH, radius, space } from '../../components/theme';

export default function AboutDataSheet({ visible, sections, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={s.root} testID="about-data">
        <Text style={s.h1}>About this data</Text>
        <ScrollView contentContainerStyle={s.body}>
          {sections.map((section) => (
            <View key={section.title} style={s.section}>
              <Text style={s.h2}>{section.title}</Text>
              {section.lines.map((line) => <Text key={line} style={s.line} selectable>{line}</Text>)}
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={s.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={s.closeT}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, padding: space.l, paddingTop: 48 },
  h1: { color: color.text, fontSize: font.h1, fontWeight: '700', marginBottom: space.s },
  body: { gap: space.m, paddingBottom: space.l },
  section: {
    backgroundColor: color.surface, borderColor: color.border, borderWidth: 1, borderRadius: radius.l, padding: space.m, gap: space.xs,
  },
  h2: { color: color.text, fontSize: font.h2, fontWeight: '700' },
  line: { color: color.textDim, fontSize: font.body, lineHeight: 20 },
  close: {
    minHeight: MIN_TOUCH, borderRadius: radius.m, borderWidth: 1, borderColor: color.accent, backgroundColor: color.accentBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: space.l,
  },
  closeT: { color: color.accent, fontSize: font.body, fontWeight: '600' },
});
