/*
 * A bottom sheet over the screen, and the Details sheet built on it: the ids, checksums, versions and build that
 * Direction A moves off the main surface. The header's Info button opens it; a screen can open its own (sorting
 * rules, the outlier definition). The sheet hides itself while the session cover is up, so no data shows over it.
 */

import React, { useContext } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from './Controls';
import { IconClose } from './icons';
import { SectionLabel } from './ListRow';
import { SessionCoverContext } from './SessionCover';
import { color, radius, size, space, type } from './theme';

export function Sheet({ visible, onClose, title, children, testID }) {
  const covered = useContext(SessionCoverContext);
  return (
    <Modal
      visible={Boolean(visible) && !covered}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.sheet} testID={testID} accessibilityViewIsModal>
          <View style={s.head}>
            <Text style={s.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
            <IconButton icon={IconClose} label="Close" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />
          </View>
          <ScrollView contentContainerStyle={s.content}>{children}</ScrollView>
          <SafeAreaView edges={['bottom']} />
        </View>
      </View>
    </Modal>
  );
}

// One selectable line of the Details sheet, for an id, a checksum or a version.
export function DetailLine({ children }) {
  return <Text style={s.line} selectable>{children}</Text>;
}

// sections: [{ title: 'This screen', lines: ['Screen SCR-01 (V3)', ...] }]; children go under them (actions).
export default function DetailsSheet({ visible, onClose, title = 'Details', sections = [], children, testID = 'details-sheet' }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      {sections.map((sec) => (
        <View key={sec.title} style={s.section}>
          <SectionLabel title={sec.title} />
          <View style={s.lines}>
            {sec.lines.map((line) => <DetailLine key={line}>{line}</DetailLine>)}
          </View>
        </View>
      ))}
      {children}
    </Sheet>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    maxHeight: '85%', backgroundColor: color.surface,
    borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l,
  },
  head: { height: size.appBar, flexDirection: 'row', alignItems: 'center', paddingLeft: space.l, paddingRight: space.xs },
  title: { ...type.screenTitle, color: color.t1, flex: 1 },
  content: { paddingHorizontal: space.l, paddingBottom: space.l, gap: space.xl },
  section: { gap: space.xs },
  lines: { gap: 2 },
  line: { fontSize: 13, lineHeight: 18, color: color.t2, fontVariant: ['tabular-nums'] },
});
