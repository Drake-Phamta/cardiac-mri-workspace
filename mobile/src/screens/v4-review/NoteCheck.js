// Under a note or a flag reason: the character count, and the privacy warning from notes.mjs when the text may
// hold a personal detail (or is too long to save).

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, type } from '../../components/theme';
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
  count: { ...type.caption, color: color.t3, textAlign: 'right', fontVariant: ['tabular-nums'] },
  over: { color: color.danger },
  warn: { ...type.caption, color: color.warn },
});
