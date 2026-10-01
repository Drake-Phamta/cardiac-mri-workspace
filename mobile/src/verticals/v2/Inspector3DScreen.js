/*
 * SCR-05 - PLACEHOLDER. Not built yet in this build.
 *
 * The owning vertical replaces this whole file (and adds anything else it
 * needs inside src/verticals/v2/). Keep the contract the navigator
 * relies on - a default export taking { runtime, nav, params }:
 *
 *   runtime  { mode, config, contract, client, fixtureScenarios }
 *            client.call(endpointId, params, options) returns an app/core
 *            screen state; render it with src/ui/StateView.js
 *   nav      { push(id, params), pop(), replace(id, params), reset(id, params), canGoBack }
 *   params   the route params; src/nav/screens.mjs lists the required ones
 */

import React from 'react';

import NotBuiltYet from '../../ui/NotBuiltYet';

export default function Inspector3DScreen({ nav, params }) {
  return (
    <NotBuiltYet
      screenId="SCR-05"
      nav={nav}
      params={params}
    />
  );
}