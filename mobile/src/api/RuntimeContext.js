/*
 * Makes the runtime (config + contract + app/core client) available to every
 * screen without threading it through props. Screens also receive it as the
 * `runtime` prop from the navigator; the hook exists for nested components.
 */

import React, { createContext, useContext } from 'react';

const RuntimeContext = createContext(null);

export function RuntimeProvider({ runtime, children }) {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  return useContext(RuntimeContext);
}
