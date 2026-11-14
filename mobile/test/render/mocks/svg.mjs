import React from 'react';

export default function Svg(props) {
  return React.createElement('Svg', props, props.children);
}
export const Path = 'Path';
export const Line = 'Line';
export const Rect = 'Rect';
// V3 StripChart (SCR-07). The svg Text gets its own host name so the harness's
// texts() never mistakes an axis label for a line of screen copy.
export const Circle = 'Circle';
export const G = 'G';
export const Text = 'SvgText';
// The viewer chrome's top scrim (Navigator.js) and gradients in general.
export const Defs = 'Defs';
export const LinearGradient = 'LinearGradient';
export const Stop = 'Stop';
