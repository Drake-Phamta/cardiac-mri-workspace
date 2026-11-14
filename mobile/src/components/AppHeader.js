/*
 * The 56 dp app bar of Direction A: Back (on a pushed screen), the title with an optional subtitle, the Live or
 * Fixture indicator (a dot and a word, no box), any extra icon buttons, and Info, which opens the Details sheet.
 * No hairline under it: the content starts right below.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconButton } from './Controls';
import { IconBack, IconInfo } from './icons';
import { color, MIN_TOUCH, size, type } from './theme';

// Live: a green dot with a soft ring. Fixture: the same slot with a grey dot. The word always says which.
export function StatusIndicator({ mode, onPress = null, accessibilityLabel, testID }) {
  const live = mode === 'live';
  const body = (
    <>
      <View style={[s.ring, live ? s.ringLive : s.ringFixture]}>
        <View style={[s.dot, { backgroundColor: live ? color.live : color.t3 }]} />
      </View>
      <Text style={s.statusT}>{live ? 'Live' : 'Fixture'}</Text>
    </>
  );
  if (!onPress) {
    return <View style={s.status} accessibilityLabel={accessibilityLabel} testID={testID}>{body}</View>;
  }
  return (
    <TouchableOpacity style={s.status} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID}>
      {body}
    </TouchableOpacity>
  );
}

export default function AppHeader({
  title, subtitle = null, onBack = null, status = null, onStatusPress = null, statusLabel, onInfo = null,
  infoLabel = 'Details', trailing = null, testID,
}) {
  return (
    <View style={[s.bar, onBack ? s.withBack : s.root]} testID={testID}>
      {onBack ? <IconButton icon={IconBack} label="Back" onPress={onBack} tint={color.t1} testID="header-back" /> : null}
      <View style={s.titleBox}>
        <Text style={subtitle ? s.titleTwoLine : s.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {status ? (
        <StatusIndicator mode={status} onPress={onStatusPress} accessibilityLabel={statusLabel} testID="header-status" />
      ) : null}
      {trailing}
      {onInfo ? <IconButton icon={IconInfo} label={infoLabel} onPress={onInfo} size={22} testID="header-info" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: size.appBar, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4, backgroundColor: color.bg },
  root: { paddingLeft: 16 },
  withBack: { paddingLeft: 4 },
  titleBox: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: { ...type.screenTitle, color: color.t1 },
  titleTwoLine: { ...type.viewerTitle, color: color.t1 },
  subtitle: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  // The dot's 3 dp ring takes 3 of the mockup's 8 dp gap, so 5 dp remain before the word.
  status: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  ring: { width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  ringLive: { backgroundColor: color.liveRing },
  ringFixture: { backgroundColor: 'rgba(132,140,151,0.16)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusT: { ...type.caption, fontWeight: '500', letterSpacing: 0.24, color: color.t2 },
});
