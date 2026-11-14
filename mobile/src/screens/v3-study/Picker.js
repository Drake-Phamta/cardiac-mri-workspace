// A compact picker, the dropdown of the design: a row with a caption, the picked value and a chevron, which opens
// a sheet listing the options. Used for the experiment of the lowest-Dice list on SCR-01.

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Sheet } from '../../components/DetailsSheet';
import { IconCheck, IconChevronDown } from '../../components/icons';
import { color, HAIRLINE, MIN_TOUCH, space, type } from '../../components/theme';

export function PickerRow({ label, value, onPress, testID }) {
  return (
    <TouchableOpacity
      style={s.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      testID={testID}
    >
      <Text style={s.label}>{label}</Text>
      <Text style={s.value} numberOfLines={1}>{value}</Text>
      <IconChevronDown size={16} color={color.t2} />
    </TouchableOpacity>
  );
}

// options: [{ id, label, note? }]; a pick closes the sheet.
export function PickerSheet({ visible, title, options, value, onPick, onClose, testID }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <View>
        {options.map((o, i) => (
          <TouchableOpacity
            key={o.id}
            style={[s.option, i > 0 && s.optionLine]}
            onPress={() => { onPick(o.id); onClose(); }}
            accessibilityRole="button"
            accessibilityState={{ selected: o.id === value }}
          >
            <View style={s.optionText}>
              <Text style={s.optionLabel}>{o.label}</Text>
              {o.note ? <Text style={s.note}>{o.note}</Text> : null}
            </View>
            {o.id === value ? <IconCheck size={18} color={color.accent} /> : null}
          </TouchableOpacity>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: space.s },
  label: { ...type.secondary, color: color.t3 },
  value: { ...type.body, fontWeight: '500', color: color.t1, flexShrink: 1 },
  option: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s },
  optionLine: { borderTopWidth: HAIRLINE, borderColor: color.hair },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { ...type.body, fontWeight: '500', color: color.t1 },
  note: { ...type.caption, color: color.t3 },
});
