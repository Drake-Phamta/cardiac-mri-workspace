// A control that is off still says why. Wrap it with the reason (reviewScreen.mjs, `st.why`; null = the control is on):
//   <Why label="Save" reason={st.why.save} say={(t) => ctl.say(t)}><Button disabled ... /></Why>
// While the reason is set, the wrapper stands in for the control: a screen reader reads its label, "dimmed" and the
// reason as the hint, and a tap shows the reason as a one-line note over the picture. With no reason the wrapper is
// a plain box that only keeps the control where it is, so the control does not move when it switches on or off.
// The box is 48 dp high and centres what is in it, which is also the touch area of a 40 dp button.

import React from 'react';
import { Pressable, View } from 'react-native';

import { MIN_TOUCH } from '../../components/theme';

const BOX = { minHeight: MIN_TOUCH, justifyContent: 'center' };

export default function Why({ reason, label, say, children, style }) {
  if (!reason) return <View style={[BOX, style]}>{children}</View>;
  return (
    <Pressable
      style={[BOX, style]}
      onPress={() => say(reason)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={reason}
      accessibilityState={{ disabled: true }}
      testID="why-off"
    >
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants">{children}</View>
    </Pressable>
  );
}
