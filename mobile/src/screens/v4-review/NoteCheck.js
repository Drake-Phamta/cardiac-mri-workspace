// Under a note or a flag reason: the character count, and the privacy warning from notes.mjs when the text may
// hold a personal detail (or is too long to save).

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../../components/theme';
import { noteMessage } from './notes.mjs';

export default function NoteCheck({ check }) {
  const message = noteMessage(check);
  return (
    <View style={s.box}>
      <Text style={[s.count, check.tooLong && s.over]}>{check.length} / {check.max}</Text>
      {message && <Text style={[s.warn, check.tooLong && s.over]} testID="note-warning">{message}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 2 },
  count: { color: color.textDim, fontSize: font.small, textAlign: 'right', fontVariant: font.numeric },
  over: { color: color.danger },
  warn: { color: color.warn, fontSize: font.small },
});
