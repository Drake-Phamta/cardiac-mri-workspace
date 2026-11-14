/*
 * The icons of the Direction A mockups, drawn on a 24 dp grid with round caps and joins (design/build/icons.svg,
 * path for path). Every icon takes size (dp), color and strokeWidth: <IconBack size={24} color={color.t1} />.
 * Icons are decoration for screen readers: the button around one carries the accessibilityLabel. Each Svg has
 * testID "icon-<Name>", so a test that counts drawn marks (overlay paths, chart dots) can leave icons out.
 */

import React from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { color as palette } from './tokens.mjs';

// Direction A draws every outline at 1.6; small icons next to text (14-16 dp) use 2.
export const ICON_STROKE = 1.6;

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
          {draw(color)}
        </G>
      </Svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

// The filled parts of an icon (dots, the play triangle) take the colour as fill and no stroke.
const solid = (c) => ({ fill: c, stroke: 'none' });
const BLOB = 'M6.6 6.4c3-2.3 8.9-2.1 11 1.1s.9 7.9-2.2 9.9-8.9 2.4-11-.7-.8-8 2.2-10.3z';
// BLOB scaled by 0.56 around the centre (the dot inside "Both").
const BLOB_SMALL = 'M8.976 8.864c1.68-1.288 4.984-1.176 6.16.616s.504 4.424-1.232 5.544-4.984 1.344-6.16-.392-.448-4.48 1.232-5.768z';
const GRID_CELLS = [[4, 4], [13.25, 4], [4, 13.25], [13.25, 13.25]];

// Navigation and headers.
export const IconBack = make('IconBack', () => (
  <><Path d="M20 12H4.5" /><Path d="M10.5 5.5 4 12l6.5 6.5" /></>
));
export const IconChevronRight = make('IconChevronRight', () => <Path d="m9 5.5 6.5 6.5L9 18.5" />);
export const IconChevronDown = make('IconChevronDown', () => <Path d="m6 9.5 6 6 6-6" />);
export const IconChevronUp = make('IconChevronUp', () => <Path d="m6 14.5 6-6 6 6" />);
export const IconClose = make('IconClose', () => <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);
export const IconSearch = make('IconSearch', () => (
  <><Circle cx={10.75} cy={10.75} r={6.25} /><Path d="m15.5 15.5 5 5" /></>
));
export const IconInfo = make('IconInfo', (c) => (
  <><Circle cx={12} cy={12} r={8.75} /><Path d="M12 11v5.5" /><Circle cx={12} cy={7.75} r={1.15} {...solid(c)} /></>
));
export const IconShield = make('IconShield', () => (
  <><Path d="M12 3.25 19 6v5.25c0 4.4-2.9 8.1-7 9.5-4.1-1.4-7-5.1-7-9.5V6z" /><Path d="m8.9 12.1 2.2 2.2 4-4.2" /></>
));
export const IconDatabase = make('IconDatabase', () => (
  <>
    <Path d="M5 6a7 2.75 0 1 0 14 0a7 2.75 0 1 0-14 0z" />
    <Path d="M5 6v12c0 1.5 3.1 2.75 7 2.75S19 19.5 19 18V6" />
    <Path d="M5 12c0 1.5 3.1 2.75 7 2.75S19 13.5 19 12" />
  </>
));
export const IconSort = make('IconSort', () => (
  <><Path d="M7.5 4.5v15M4 16l3.5 3.5L11 16" /><Path d="M16.5 19.5v-15M13 8l3.5-3.5L20 8" /></>
));
export const IconAlert = make('IconAlert', (c) => (
  <><Circle cx={12} cy={12} r={8.75} /><Path d="M12 7.5v5.25" /><Circle cx={12} cy={16.25} r={1.15} {...solid(c)} /></>
));
export const IconCheck = make('IconCheck', () => <Path d="m5.5 12.5 4.25 4.25L18.5 8" />);

// Tab bar: Study, Cases, Experiments, Findings.
export const IconGrid = make('IconGrid', () => (
  <>{GRID_CELLS.map(([x, y]) => <Rect key={`${x}-${y}`} x={x} y={y} width={6.75} height={6.75} rx={1.75} />)}</>
));
export const IconGridFilled = make('IconGridFilled', (c) => (
  <>{GRID_CELLS.map(([x, y]) => <Rect key={`${x}-${y}`} x={x} y={y} width={6.75} height={6.75} rx={1.75} fill={c} />)}</>
));
export const IconList = make('IconList', (c) => (
  <>
    <Path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
    {[6.5, 12, 17.5].map((y) => <Circle key={y} cx={5} cy={y} r={1.25} {...solid(c)} />)}
  </>
));
export const IconFlask = make('IconFlask', () => (
  <>
    <Path d="M9 3.5h6" />
    <Path d="M10.25 3.5v5.4L4.9 18.2A1.9 1.9 0 0 0 6.55 21h10.9a1.9 1.9 0 0 0 1.65-2.8L13.75 8.9V3.5" />
    <Path d="M7.2 15.25h9.6" />
  </>
));
export const IconFlag = make('IconFlag', () => (
  <><Path d="M5.5 21V4" /><Path d="M5.5 4.75h11.75l-2.5 4.25 2.5 4.25H5.5" /></>
));

// Viewer: layers and draw mode.
export const IconEye = make('IconEye', () => (
  <><Path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z" /><Circle cx={12} cy={12} r={2.75} /></>
));
export const IconEyeOff = make('IconEyeOff', () => (
  <>
    <Path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z" />
    <Circle cx={12} cy={12} r={2.75} />
    <Path d="m4 4 16 16" />
  </>
));
export const IconLayers = make('IconLayers', () => (
  <><Path d="M12 3.75 20.5 8 12 12.25 3.5 8z" /><Path d="m3.5 12 8.5 4.25L20.5 12" /><Path d="m3.5 16 8.5 4.25L20.5 16" /></>
));
export const IconFill = make('IconFill', (c) => <Path d={BLOB} {...solid(c)} />);
export const IconOutline = make('IconOutline', () => <Path d={BLOB} />);
export const IconBoth = make('IconBoth', (c) => <><Path d={BLOB} /><Path d={BLOB_SMALL} {...solid(c)} /></>);

// Viewer: slice transport. Step = one slice, the "10" icons jump ten.
export const IconPlay = make('IconPlay', (c) => (
  <Path d="M8 5.6v12.8c0 .8.9 1.3 1.6.85l10-6.4a1 1 0 0 0 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6z" {...solid(c)} />
));
export const IconPause = make('IconPause', (c) => (
  <><Rect x={6.75} y={5} width={4} height={14} rx={1.25} {...solid(c)} /><Rect x={13.25} y={5} width={4} height={14} rx={1.25} {...solid(c)} /></>
));
export const IconStepBack = make('IconStepBack', (c) => (
  <>
    <Path d="M6.5 5.5v13" />
    <Path d="M18 6.6v10.8c0 .75-.85 1.2-1.5.75l-7.6-5.4a.9.9 0 0 1 0-1.5l7.6-5.4c.65-.45 1.5 0 1.5.75z" {...solid(c)} />
  </>
));
export const IconStepForward = make('IconStepForward', (c) => (
  <>
    <Path d="M17.5 5.5v13" />
    <Path d="M6 6.6v10.8c0 .75.85 1.2 1.5.75l7.6-5.4a.9.9 0 0 0 0-1.5L7.5 5.85C6.85 5.4 6 5.85 6 6.6z" {...solid(c)} />
  </>
));
const ten = (c, x) => (
  <SvgText x={x} y={15.3} textAnchor="middle" fontSize={7.4} fontWeight="700" {...solid(c)}>10</SvgText>
);
export const IconReplay10 = make('IconReplay10', (c) => (
  <><Path d="M12 4.25a7.75 7.75 0 1 1-7.75 7.75" /><Path d="M14.4 1.9 12 4.25l2.4 2.4" />{ten(c, 12.4)}</>
));
export const IconForward10 = make('IconForward10', (c) => (
  <><Path d="M12 4.25a7.75 7.75 0 1 0 7.75 7.75" /><Path d="M9.6 1.9 12 4.25 9.6 6.65" />{ten(c, 11.6)}</>
));
