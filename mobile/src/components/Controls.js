/*
 * The small controls of Direction A: an icon button, a text button, a compact segmented control, the layer chip
 * that floats over the image, and a tag. Every control's hit area is at least 48 x 48; where the visual is
 * smaller (a 32 dp segment, a 36 dp chip, a 40 dp button) hitSlopFor() pads it from its height, and a control that
 * can be narrower than 48 dp (a short label) has a minWidth. test/render/touch_targets.mjs measures every one.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconEye, IconEyeOff } from './icons';
import { color, hitSlopFor, MIN_TOUCH, radius, size, type } from './theme';

// A 48 dp round button around one icon. `label` is what a screen reader says.
export function IconButton({
  icon: Icon, label, onPress, size: iconSize = size.icon, tint = color.t2, active = false, disabled = false, testID, style,
}) {
  return (
    <TouchableOpacity
      style={[s.iconBtn, disabled && s.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      testID={testID}
    >
      <Icon size={iconSize} color={active ? color.accent : tint} />
    </TouchableOpacity>
  );
}

/*
 * A text button. primary: the one action of a panel (accent on accent-soft); secondary: a neutral action
 * (t1 on raised); quiet: text only, for "Details" and similar. `block` stretches it to the full width.
 */
export function Button({
  label, onPress, variant = 'primary', icon: Icon = null, block = false, disabled = false, testID, accessibilityLabel,
}) {
  const v = VARIANT[variant] || VARIANT.primary;
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: v.bg }, variant === 'quiet' && s.btnQuiet, block && s.block, disabled && s.disabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(size.button)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      {Icon ? <Icon size={18} color={v.fg} /> : null}
      <Text style={[s.btnT, { color: v.fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const VARIANT = {
  primary: { bg: color.accentSoft, fg: color.accent },
  secondary: { bg: color.raised, fg: color.t1 },
  quiet: { bg: 'transparent', fg: color.accent },
};

/*
 * Pick one of a few options: a 32 dp track in `field`, the selected segment in accent on accent-soft.
 * options: [{ value, label, icon? }]. The labels say the choice, so the selection never relies on colour.
 */
export function SegmentedControl({ options, value, onChange, label, testID }) {
  return (
    <View style={s.track} accessibilityLabel={label} testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon || null;
        return (
          <TouchableOpacity
            key={String(o.value)}
            style={[s.segment, Icon && s.segmentIcon, on && s.segmentOn]}
            onPress={() => onChange(o.value)}
            hitSlop={hitSlopFor(SEGMENT_HEIGHT)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            {Icon ? <Icon size={14} strokeWidth={2} color={on ? color.accent : color.t2} /> : null}
            <Text style={[s.segmentT, on && s.segmentTOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/*
 * The layer chip over the image: an eye, a 14 x 3 colour key and the layer's name. Tap to show or hide the layer.
 * The off state is said twice without colour: the crossed eye and the dimmed key.
 */
export function Chip({ label, swatch = null, on = true, onPress, testID }) {
  const Eye = on ? IconEye : IconEyeOff;
  return (
    <TouchableOpacity
      style={s.chip}
      onPress={onPress}
      hitSlop={hitSlopFor(size.chip)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      testID={testID}
    >
      <Eye size={18} color={color.t2} />
      {swatch ? <View style={[s.swatch, { backgroundColor: swatch }, !on && s.swatchOff]} /> : null}
      <Text style={[s.chipT, !on && s.chipTOff]}>{label}</Text>
    </TouchableOpacity>
  );
}

// A 20 dp tag next to an id: neutral (a mode, "Inference & review"), warn ("Outlier 1/3") or danger.
export function Tag({ label, tone = 'neutral' }) {
  const t = TAG[tone] || TAG.neutral;
  return (
    <View style={[s.tag, { backgroundColor: t.bg }]}>
      <Text style={[s.tagT, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const TAG = {
  neutral: { bg: color.raised, fg: color.t2 },
  warn: { bg: color.warnSoft, fg: color.warn },
  danger: { bg: color.dangerSoft, fg: color.danger },
};

// A segment is the track's height less its 2 dp padding above and below.
const SEGMENT_HEIGHT = size.segmented - 4;

const s = StyleSheet.create({
  iconBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  btn: {
    height: size.button, minWidth: MIN_TOUCH, paddingHorizontal: 16, borderRadius: radius.m,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start',
  },
  // Text only: flush left, so the minWidth that keeps a short word 48 dp wide does not move the word.
  btnQuiet: { paddingHorizontal: 0, justifyContent: 'flex-start' },
  block: { alignSelf: 'stretch' },
  btnT: { ...type.body, fontWeight: '500' },
  track: {
    flexDirection: 'row', height: size.segmented, padding: 2, borderRadius: radius.m, backgroundColor: color.field,
    alignSelf: 'flex-start',
  },
  // minWidth keeps a short label ("IoU", "Raw") at least MIN_TOUCH wide; hitSlop adds the height.
  segment: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12,
    minWidth: MIN_TOUCH, borderRadius: radius.s,
  },
  segmentIcon: { paddingHorizontal: 10 },
  segmentOn: { backgroundColor: color.accentSoft },
  segmentT: { ...type.secondary, fontWeight: '500', color: color.t2 },
  segmentTOn: { color: color.accent },
  chip: {
    height: size.chip, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, paddingRight: 12,
    borderRadius: radius.m, backgroundColor: color.glass, borderWidth: 1, borderColor: color.glassEdge,
  },
  swatch: { width: 14, height: 3, borderRadius: 2 },
  swatchOff: { opacity: 0.35 },
  chipT: { ...type.secondary, fontWeight: '500', color: color.t1 },
  chipTOff: { color: color.t2 },
  tag: { height: 20, justifyContent: 'center', paddingHorizontal: 6, borderRadius: radius.xs, alignSelf: 'flex-start' },
  tagT: { ...type.micro, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
