// The 72 dp picture beside the dataset name on SCR-01: a drawing, not an image. Grey tissue with two dark lobes,
// a lighter chamber and one closed cyan contour (the colour of a ground-truth outline) with a small second one, like
// the thumbnail of the mockup. It is an illustration, so it holds no patient data and "no image is shown here"
// stays true.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color, overlay } from '../../components/theme';

const LOBE_LEFT = 'M0 0H29c-7 9-9 21-5 32s-8 21-24 24z';
const LOBE_RIGHT = 'M72 0H47c5 11 6 22 2 31s8 20 23 24z';
const CHAMBER = 'M14 31c3-11 19-16 32-11s15 14 8 24-22 15-32 8-11-11-8-21z';
const CONTOUR = 'M12 33c-2-9 5-17 16-18s25 1 31 8 1 13-7 17-17 6-23 9-15-3-17-16z';
const SECOND = 'M56 54c2-3 6-2 7 1s-1 7-5 6-4-4-2-7z';

export default function DatasetThumb() {
  return (
    <View style={s.thumb} testID="scr01-thumb" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={72} height={72} viewBox="0 0 72 72">
        <Rect x={0} y={0} width={72} height={72} fill={color.track} />
        <Path d={LOBE_LEFT} fill={color.surface} />
        <Path d={LOBE_RIGHT} fill={color.surface} />
        <Path d={CHAMBER} fill={color.tick} />
        <Circle cx={40} cy={58} r={6} fill="none" stroke={color.barNeutral} strokeWidth={1} />
        <Path d={CONTOUR} fill="none" stroke={overlay.halo} strokeWidth={3} />
        <Path d={CONTOUR} fill="none" stroke={overlay.groundTruth} strokeWidth={1.25} strokeLinejoin="round" />
        <Path d={SECOND} fill="none" stroke={overlay.groundTruth} strokeWidth={1.1} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  thumb: {
    width: 72, height: 72, borderRadius: 6, overflow: 'hidden', backgroundColor: color.viewer,
    borderWidth: 1, borderColor: color.hair,
  },
});
