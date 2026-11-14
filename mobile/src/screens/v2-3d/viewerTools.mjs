// The tools drawn over the SCR-05 WebGL page, in the Direction A viewer language: translucent glass groups (the
// `glass` colour and hairline edge of the tokens) with 48 px hit areas and the shared icon set's 24 grid and 1.6 stroke.
//   top left     Views     +X -X +Y -Y +Z -Z and Fit (look along a voxel axis)
//   right        Cut       hide the surface above the selected slice
//   bottom left  Layers    Prediction and Ground truth (eye, colour key, opacity 30 / 60 / 100 %), Errors with
//                          Previous / Next through the FP / FN regions
// The page owns this state (which layers are shown, their opacity, the cut): the app only sends data and learns about
// a selection. TOOLS_SCRIPT is not a module: viewerHtml.mjs splices it into the page script, so it shares that script's
// variables (visible, opacity, markers, layers, sliceIndex ...). It is ES5 and has no backtick or dollar-brace,
// because it is carried inside a String.raw template here.

import { color, errorClass, HAIRLINE, MIN_TOUCH, overlay, radius } from '../../components/tokens.mjs';

const GLASS = `background:${color.glass};border:${HAIRLINE}px solid ${color.glassEdge}`;

export const TOOLS_CSS = `
#tools{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;color:${color.t1};
  font:500 13px/16px Roboto,system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#tools button{border:0;background:none;color:inherit;font:inherit;margin:0;padding:0;display:flex;align-items:center;
  justify-content:center;min-width:${MIN_TOUCH}px;min-height:${MIN_TOUCH}px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#tools button:disabled{opacity:.4}
#tools .g{position:absolute;pointer-events:auto;display:flex;${GLASS}}
#tools .views{left:12px;top:12px;padding:3px;gap:2px;border-radius:${radius.l}px}
#tools .views button{border-radius:7px;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
#tools .views button:active,#tools .cut button:active{background:${color.accentSoft}}
#tools .sep{width:1px;margin:8px 3px;background:${color.hair}}
#tools .cut{right:12px;top:70px;padding:3px;border-radius:${radius.l}px}
#tools .cut button{flex-direction:column;gap:2px;min-width:50px;min-height:52px;border-radius:7px;color:${color.t2};
  font-size:11px;line-height:14px}
#tools .cut button[aria-pressed=true]{background:${color.accentSoft};color:${color.accent}}
#tools .note{position:absolute;right:12px;top:132px;padding:6px 10px;border-radius:${radius.m}px;font-size:12px;
  ${GLASS}}
#tools .layers{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column}
#tools .row{display:flex;align-items:center;gap:8px;height:48px;pointer-events:none}
#tools .row>*{pointer-events:auto}
#tools .vis{height:36px;display:flex;align-items:center;gap:8px;border-radius:${radius.m}px;box-sizing:border-box;${GLASS}}
#tools .chip{padding:0 12px 0 10px;color:${color.t1}}
#tools .chip svg{color:${color.t2}}
#tools button[aria-pressed=false] .chip{color:${color.t2}}
#tools .key{width:14px;height:3px;border-radius:2px}
#tools button[aria-pressed=false] .key{opacity:.35}
#tools .keys{display:flex;gap:3px}
#tools .dot,#tools .sq{width:8px;height:8px}
#tools .dot{border-radius:4px}
#tools .sq{border-radius:1px}
#tools .seg,#tools .step{display:flex;align-items:center;height:36px;border-radius:${radius.m}px;box-sizing:border-box;${GLASS}}
#tools .seg{padding:2px}
#tools .seg .vis{width:44px;justify-content:center;height:32px;border:0;background:none;border-radius:${radius.s}px;
  color:${color.t2};font-size:12px;font-variant-numeric:tabular-nums}
#tools .seg button[aria-pressed=true] .vis{background:${color.accentSoft};color:${color.accent}}
#tools .count{min-width:60px;text-align:center;font-variant-numeric:tabular-nums}
#tools .none{color:${color.t2};padding:0 4px}
`;

// Page colours: the one place the tokens reach the page. Surfaces use the prediction / ground truth overlay colours
// of the 2D screens, error markers the error-class colours, so the whole app has one legend.
export const PALETTE = Object.freeze({
  background: color.bg,
  prediction: overlay.prediction,
  groundTruth: overlay.groundTruth,
  FN: errorClass.FN,
  FP: errorClass.FP,
  axis: color.t2,
  axisCaption: color.t3,
});

// Appended to the page script, after the state and the actions it calls (setLayer, setOpacity, setCut, view, fit, step).
export const TOOLS_SCRIPT = String.raw`
var toolsEl = document.getElementById("tools");
var OPACITY_STEPS = [0.3, 0.6, 1];
var AXIS_VIEWS = [["+x", "+X"], ["-x", "−X"], ["+y", "+Y"], ["-y", "−Y"], ["+z", "+Z"], ["-z", "−Z"]];
var LAYER_NAMES = { prediction: "Prediction", groundTruth: "Ground truth", errors: "Errors" };
// Icons of the shared set (components/icons.js), as inner SVG on the 24 grid.
var ICONS = {
  eye: '<path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="2.75"/>',
  eyeOff: '<path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z"/><circle cx="12" cy="12" r="2.75"/><path d="m4 4 16 16"/>',
  prev: '<path d="m15 5.5-6.5 6.5 6.5 6.5"/>',
  next: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  cut: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.2 15.7 18 4.5M15.8 15.7 6 4.5"/>'
};

function icon(name, px) {
  return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
}
function percent(a) { return Math.round(a * 100) + "%"; }
// pressed: true / false for a toggle, null for a plain button.
function button(act, arg, label, pressed, inner, disabled) {
  return '<button data-act="' + act + '" data-arg="' + arg + '" aria-label="' + label + '"' +
    (pressed === null ? "" : ' aria-pressed="' + pressed + '"') + (disabled ? " disabled" : "") + ">" + inner + "</button>";
}

function viewsHtml() {
  var cells = AXIS_VIEWS.map(function (v) {
    var label = "View from " + (v[0].charAt(0) === "+" ? "plus " : "minus ") + v[0].charAt(1);
    return button("view", v[0], label, null, v[1], false);
  }).join("");
  return '<div class="g views" role="toolbar" aria-label="Views">' + cells + '<i class="sep"></i>' +
    button("fit", "", "Fit the model in view", null, "Fit", false) + "</div>";
}

function cutHtml() {
  var can = sliceIndex !== null;
  var html = '<div class="g cut">' + button("cut", "", "Cut at the selected slice", can && cutOn,
    icon("cut", 20) + "<span>Cut</span>", !can) + "</div>";
  if (cutOn && can) html += '<div class="note">Above slice ' + (sliceIndex + 1) + " hidden</div>";
  return html;
}

// One layer chip: an eye (crossed when hidden), the layer's colour key and its name. Tap to show or hide.
function chipHtml(role, key) {
  var on = visible[role];
  return button("layer", role, LAYER_NAMES[role], on,
    '<span class="vis chip">' + icon(on ? "eye" : "eyeOff", 18) + key + "<span>" + LAYER_NAMES[role] + "</span></span>", false);
}
function surfaceRow(role) {
  if (!layers[role]) return "";
  var name = LAYER_NAMES[role];
  var key = '<i class="key" style="background:' + PALETTE[role] + '"></i>';
  var steps = OPACITY_STEPS.map(function (a) {
    return button("opacity", role + ":" + a, name + " opacity " + percent(a), opacity[role] === a, '<span class="vis">' + percent(a) + "</span>", false);
  }).join("");
  return '<div class="row">' + chipHtml(role, key) + (visible[role] ? '<div class="seg" role="group" aria-label="' + name + ' opacity">' + steps + "</div>" : "") + "</div>";
}

// FN is a round dot and FP a square, here as on the surface, so the class never depends on colour alone.
function errorsRow() {
  if (!markersLoaded) return "";
  var key = '<span class="keys"><i class="dot" style="background:' + PALETTE.FN + '"></i><i class="sq" style="background:' + PALETTE.FP + '"></i></span>';
  var at = selectedIndex();
  var n = markers.length;
  var stepper = n === 0 ? '<span class="none">None</span>' :
    '<div class="step">' + button("step", "-1", "Previous error region", null, icon("prev", 18), false) +
    '<span class="count">' + (at < 0 ? n + (n === 1 ? " region" : " regions") : (at + 1) + " / " + n) + "</span>" +
    button("step", "1", "Next error region", null, icon("next", 18), false) + "</div>";
  return '<div class="row">' + chipHtml("errors", key) + stepper + "</div>";
}

function toolsMarkup() {
  if (!layers.prediction && !layers.groundTruth) return "";   // nothing to look at yet: no tools
  return viewsHtml() + cutHtml() + '<div class="layers">' + surfaceRow("prediction") + surfaceRow("groundTruth") + errorsRow() + "</div>";
}
function renderTools() { if (toolsEl) toolsEl.innerHTML = toolsMarkup(); }

// One listener for every tool: the button says what it does in data-act / data-arg.
function onToolClick(e) {
  var el = e && e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (!el) return;
  var act = el.dataset.act, arg = el.dataset.arg;
  if (act === "layer") setLayer(arg, !visible[arg]);
  else if (act === "opacity") setOpacity(arg.split(":")[0], Number(arg.split(":")[1]));
  else if (act === "cut") setCut(!cutOn);
  else if (act === "view") view(arg);
  else if (act === "fit") fit();
  else if (act === "step") step(Number(arg));
  renderTools();
}
if (toolsEl) toolsEl.addEventListener("click", onToolClick);
`;
