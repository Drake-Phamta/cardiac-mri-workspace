/*
 * Measures the hit area of a touchable in a react-test-renderer tree, the way React Native would size it: the height its
 * style gives it (height, else minHeight, else the height of the row that stretches it) plus its hitSlop. There is no
 * layout engine in Node, so this is style arithmetic, not a frame measured on a phone. Used by touch_targets.mjs (the
 * shared components) and by the render smoke (the screens). Pure: it imports nothing.
 */

export const flat = (st) => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : (st && typeof st === 'object' ? st : {}));
const num = (v) => (typeof v === 'number' ? v : 0);
const hostParent = (n) => { let p = n.parent; while (p && typeof p.type !== 'string') p = p.parent; return p; };
const slopOf = (node) => {
  const h = node.props.hitSlop;
  if (!h) return { top: 0, bottom: 0, left: 0, right: 0 };
  if (typeof h === 'number') return { top: h, bottom: h, left: h, right: h };
  return { top: num(h.top), bottom: num(h.bottom), left: num(h.left), right: num(h.right) };
};
// A style that fills its parent (StyleSheet.absoluteFill): the backdrop behind a sheet, not a sized control.
const fillsParent = (st) => st.position === 'absolute' && st.left === 0 && st.right === 0 && st.top === 0 && st.bottom === 0;
const innerHeight = (st, h) => h - (num(st.paddingTop ?? st.paddingVertical ?? st.padding) + num(st.paddingBottom ?? st.paddingVertical ?? st.padding))
  - (num(st.borderTopWidth ?? st.borderWidth) + num(st.borderBottomWidth ?? st.borderWidth));

// The height a style gives a node: height, else minHeight, else (in a row whose items stretch, or alignSelf stretch)
// the inner height of its parent. null = the styles say nothing about it.
function boxHeight(node) {
  const st = flat(node.props.style);
  if (typeof st.height === 'number') return st.height;
  if (typeof st.minHeight === 'number') return st.minHeight;
  const parent = hostParent(node);
  if (!parent) return null;
  const ps = flat(parent.props.style);
  const stretched = st.alignSelf === 'stretch'
    || (st.alignSelf === undefined && ps.flexDirection === 'row' && (ps.alignItems === undefined || ps.alignItems === 'stretch'));
  if (!stretched) return null;
  const outer = boxHeight(parent);
  return outer === null ? null : innerHeight(ps, outer);
}

// { height, width } of the area that answers a touch: the box plus its hitSlop. width is null for a content-sized control.
export function hitArea(node) {
  const st = flat(node.props.style);
  const slop = slopOf(node);
  const h = boxHeight(node);
  const w = typeof st.width === 'number' ? st.width : (typeof st.minWidth === 'number' ? st.minWidth : null);
  return {
    height: h === null ? null : h + slop.top + slop.bottom,
    width: w === null ? null : w + slop.left + slop.right,
    fills: fillsParent(st),
  };
}

export const isTouchable = (n) => (n.type === 'TouchableOpacity' || n.type === 'Pressable') && typeof n.props.onPress === 'function';
export const named = (n) => n.props.testID || n.props.accessibilityLabel || n.props.accessibilityRole || 'touchable';


// The touchables under `root` whose hit area is not at least `min` high, as readable names: too short (with the height),
// or no height from the styles at all. A full-screen backdrop (absoluteFill) is not a sized control and is skipped.
export function shortTouchables(root, min = 48) {
  const out = [];
  for (const t of root.findAll(isTouchable)) {
    const a = hitArea(t);
    if (a.fills) continue;
    if (a.height === null) out.push(`${named(t)} (no height from the styles)`);
    else if (a.height < min) out.push(`${named(t)} ${a.height} dp`);
  }
  return out;
}
