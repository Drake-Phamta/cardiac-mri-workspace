/*
 * The review tools' icons that the shared set (components/icons.js) does not have: brush, move, add, erase, undo,
 * redo, reset, zoom in, zoom out, fit. Drawn like the shared ones: a 24 dp grid, round caps and joins, stroke =
 * the colour, 1.6 wide; every Svg has testID "icon-<Name>", so a test that counts drawn marks leaves them out.
 * If the shell adds these to icons.js, delete this file and import them from there.
 */

import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { color as palette } from '../../components/tokens.mjs';
import { ICON_STROKE } from '../../components/icons';

function make(name, draw) {
  function Icon({ size = 24, color = palette.t2, strokeWidth = ICON_STROKE }) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        testID={`icon-${name}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
          {draw()}
        </G>
      </Svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

// A pencil: the tip at the lower left, the ferrule line near the top.
export const IconBrush = make('IconBrush', () => (
  <><Path d="M4 20l1.3-4.4L16.7 4.2a2.1 2.1 0 0 1 3 3L8.4 18.7z" /><Path d="m14.6 6.3 3.1 3.1" /></>
));
// Four arrows: move the picture.
export const IconMove = make('IconMove', () => (
  <>
    <Path d="M12 3.5v17M3.5 12h17" />
    <Path d="m9 6.5 3-3 3 3M9 17.5l3 3 3-3M6.5 9l-3 3 3 3M17.5 9l3 3-3 3" />
  </>
));
export const IconPlus = make('IconPlus', () => <Path d="M12 5v14M5 12h14" />);
export const IconEraser = make('IconEraser', () => (
  <>
    <Path d="m4.7 15.1 9.6-9.6a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8l-7.5 7.5H8.2L4.7 15.1a1.6 1.6 0 0 1 0-2z" />
    <Path d="M9.6 9.8 15 15.2M12.5 19.6H20" />
  </>
));
export const IconUndo = make('IconUndo', () => (
  <><Path d="m9 14.5-4.5-4.5L9 5.5" /><Path d="M4.5 10H15a4.5 4.5 0 0 1 0 9h-3" /></>
));
export const IconRedo = make('IconRedo', () => (
  <><Path d="m15 14.5 4.5-4.5L15 5.5" /><Path d="M19.5 10H9a4.5 4.5 0 0 0 0 9h3" /></>
));
// A circular arrow, counter-clockwise: back to the start.
export const IconReset = make('IconReset', () => (
  <><Path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" /><Path d="M4.8 4.2v4.3h4.3" /></>
));
export const IconZoomIn = make('IconZoomIn', () => (
  <><Circle cx={10.5} cy={10.5} r={6.5} /><Path d="m15.3 15.3 5.2 5.2M10.5 7.8v5.4M7.8 10.5h5.4" /></>
));
export const IconZoomOut = make('IconZoomOut', () => (
  <><Circle cx={10.5} cy={10.5} r={6.5} /><Path d="m15.3 15.3 5.2 5.2M7.8 10.5h5.4" /></>
));
// Four corners: fit the picture to the screen.
export const IconFit = make('IconFit', () => <Path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />);
