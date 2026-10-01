/*
 * What the user chose earlier in this app session, and nothing else.
 *
 * The prediction variant is never defaulted (`11` §6, V1 model). The first
 * case asks; after that the user's own last choice is pre-selected for the
 * next case and SHOWN as such ("chosen earlier this session") - a remembered
 * explicit choice, visible on screen, not a value the app picked.
 * Memory only: a restart asks again.
 */

const state = { variant: null };

export function rememberedVariant() {
  return state.variant;
}

export function rememberVariant(variant) {
  if (variant === 'RAW' || variant === 'PROCESSED') state.variant = variant;
}

export function forgetSession() {
  state.variant = null;
}
