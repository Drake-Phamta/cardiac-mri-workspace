import React from 'react';

export function SafeAreaProvider({ children }) {
  return children;
}
export function SafeAreaView(props) {
  return React.createElement('SafeAreaView', props, props.children);
}
