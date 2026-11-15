/*
 * The 56 dp app bar of Direction A: Back (on a pushed screen), the title with an optional subtitle, the Live or
 * Fixture indicator (a dot and a word, no box), any extra icon buttons, and Info, which opens the Details sheet.
 * No hairline under it: the content starts right below.
 * `floating` is the viewer's top bar (chrome VIEWER): no fill of its own, the shell draws it over the image on a
 * dark scrim, and the title takes the viewer size. `onSubtitlePress` turns the subtitle into a button with a
 * chevron (a run picker); `overflow` adds a "more" button after Info for the screen's own menu.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconButton } from './Controls';
import { FitProbe, useFitFontSize } from './FitText';
import { IconBack, IconChevronDown, IconInfo, IconMore } from './icons';
import { BAR_TEXT_MIN_SCALE, color, LABEL_FONT_CAP, MIN_TOUCH, size, type } from './theme';

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

// The chevron after a subtitle and the gap before it, so the subtitle's room is the box minus this.
const CHEVRON_SIZE = 12;
const SUBTITLE_GAP = 2;

// A Text style with the fitted size when there is one; a line that is not fitted keeps its style as it is.
const sized = (style, fit) => (fit.size === null ? style : [style, { fontSize: fit.size }]);

// Title and subtitle. With onSubtitlePress the whole block (the bar's full height) is one button, and a chevron
// follows the subtitle, so the run picker has a 56 dp target although the subtitle line is 16 dp.
// The floating bar of a viewer has Back and up to three icon buttons round the title, so the room it leaves does not
// grow with the text: at 320 dp and font scale 1.3 "CASE_0029" and "DINOv2 100 %" showed as "CASE_00..." and "DINOv2 10...".
// There both lines stop growing at LABEL_FONT_CAP; a bar with a plain screen title keeps following the system size. A line that still does
// not fit is measured and drawn smaller (FitText.js, fitFontSize.mjs, tokens.mjs BAR_TEXT_MIN_SCALE) instead of ending in "...":
// "Error Insp..." at 320 dp was the title of SCR-04, and Text adjustsFontSizeToFit did not shrink it on Android.
function TitleBlock({ title, subtitle, large, floating, onSubtitlePress, subtitleLabel }) {
  const cap = floating ? LABEL_FONT_CAP : undefined;
  const titleStyle = large ? s.titleTwoLine : s.title;
  // The width of this box does not depend on the text (flex 1, minWidth 0), so the sizes picked from it do not move it.
  const [room, setRoom] = useState(null);
  const onBoxLayout = floating ? (e) => {
    const w = e.nativeEvent.layout.width;
    setRoom((cur) => (cur !== null && Math.abs(cur - w) < 0.5 ? cur : w));
  } : undefined;
  const titleFit = useFitFontSize({
    text: title, base: (large ? type.viewerTitle : type.screenTitle).fontSize, minScale: BAR_TEXT_MIN_SCALE.title, available: room, enabled: floating,
  });
  const subtitleFit = useFitFontSize({
    text: subtitle || '', base: type.caption.fontSize, minScale: BAR_TEXT_MIN_SCALE.subtitle,
    available: room === null ? null : room - (onSubtitlePress ? CHEVRON_SIZE + SUBTITLE_GAP : 0), enabled: floating && Boolean(subtitle),
  });
  const lines = (
    <>
      <Text
        style={sized(titleStyle, titleFit)}
        numberOfLines={1}
        maxFontSizeMultiplier={cap}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle ? (
        <View style={s.subtitleRow}>
          <Text
            style={sized([s.subtitle, s.subtitleIn], subtitleFit)}
            numberOfLines={1}
            maxFontSizeMultiplier={cap}
          >
            {subtitle}
          </Text>
          {onSubtitlePress ? <IconChevronDown size={CHEVRON_SIZE} strokeWidth={2} color={color.t2} /> : null}
        </View>
      ) : null}
      {floating ? <FitProbe fit={titleFit} text={title} style={titleStyle} maxFontSizeMultiplier={cap} /> : null}
      {floating && subtitle ? <FitProbe fit={subtitleFit} text={subtitle} style={s.subtitle} maxFontSizeMultiplier={cap} /> : null}
    </>
  );
  if (!onSubtitlePress) return <View style={s.titleBox} onLayout={onBoxLayout}>{lines}</View>;
  return (
    <TouchableOpacity
      style={[s.titleBox, s.titleBtn]}
      onPress={onSubtitlePress}
      onLayout={onBoxLayout}
      accessibilityRole="button"
      accessibilityLabel={subtitleLabel || `${title}, ${subtitle}`}
      testID="header-subtitle"
    >
      {lines}
    </TouchableOpacity>
  );
}

export default function AppHeader({
  title, subtitle = null, onBack = null, status = null, onStatusPress = null, statusLabel, onInfo = null,
  infoLabel = 'Details', trailing = null, floating = false, onSubtitlePress = null, subtitleLabel, overflow = null, testID,
}) {
  return (
    <View style={[s.bar, onBack ? s.withBack : s.root, floating && s.floating]} testID={testID}>
      {onBack ? <IconButton icon={IconBack} label="Back" onPress={onBack} tint={color.t1} testID="header-back" /> : null}
      <TitleBlock
        title={title}
        subtitle={subtitle}
        large={Boolean(subtitle) || floating}
        floating={floating}
        onSubtitlePress={subtitle ? onSubtitlePress : null}
        subtitleLabel={subtitleLabel}
      />
      {status ? (
        <StatusIndicator mode={status} onPress={onStatusPress} accessibilityLabel={statusLabel} testID="header-status" />
      ) : null}
      {trailing}
      {onInfo ? (
        <IconButton icon={IconInfo} label={infoLabel} onPress={onInfo} size={floating ? size.icon : 22} tint={floating ? color.t1 : color.t2} testID="header-info" />
      ) : null}
      {overflow ? (
        <IconButton icon={IconMore} label={overflow.label || 'More'} onPress={overflow.onPress} tint={floating ? color.t1 : color.t2} testID="header-more" />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: size.appBar, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4, backgroundColor: color.bg },
  root: { paddingLeft: 16 },
  withBack: { paddingLeft: 4 },
  floating: { backgroundColor: 'transparent' },
  titleBox: { flex: 1, minWidth: 0, justifyContent: 'center' },
  titleBtn: { alignSelf: 'stretch' },
  title: { ...type.screenTitle, color: color.t1 },
  titleTwoLine: { ...type.viewerTitle, color: color.t1 },
  subtitle: { ...type.caption, color: color.t2, fontVariant: ['tabular-nums'] },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: SUBTITLE_GAP },
  subtitleIn: { flexShrink: 1 },
  // The dot's 3 dp ring takes 3 of the mockup's 8 dp gap, so 5 dp remain before the word.
  status: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  ring: { width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  ringLive: { backgroundColor: color.liveRing },
  ringFixture: { backgroundColor: 'rgba(132,140,151,0.16)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusT: { ...type.caption, fontWeight: '500', letterSpacing: 0.24, color: color.t2 },
});
