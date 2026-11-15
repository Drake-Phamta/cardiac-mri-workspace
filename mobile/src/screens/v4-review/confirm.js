// A Cancel / OK question before something that cannot be taken back (Save, Reset, Cancel edits, Flag, leaving with
// unsaved edits), drawn as the viewer's own sheet and never as the system dialog. The screen calls useConfirm() once,
// draws `question` once (next to its other sheets) and hands `ask` to the parts that need it:
//   ask({ title, lines: ['Not reviewed → Corrected', { text: 'Careful', tone: 'warn' }], okLabel: 'Save', onOk })
// Cancel, the close button, the back button and a tap outside the sheet all answer "no" (onCancel).

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Controls';
import { Sheet } from '../../components/DetailsSheet';
import { color, space, type } from '../../components/theme';

export default function useConfirm() {
  const [req, setReq] = useState(null); // the last request, kept while the sheet fades out; `open` says if it is shown
  const ask = useCallback((request) => setReq({ cancelLabel: 'Cancel', okLabel: 'OK', ...request, open: true }), []);

  const answer = (yes) => {
    if (!req || !req.open) return;
    setReq({ ...req, open: false });
    const next = yes ? req.onOk : req.onCancel;
    if (next) next();
  };

  const question = (
    <Sheet visible={Boolean(req && req.open)} onClose={() => answer(false)} title={req ? req.title : ''} testID="confirm-sheet">
      {req ? (
        <>
          <View style={s.lines}>
            {(req.lines || []).map((line, i) => {
              const l = typeof line === 'string' ? { text: line } : line;
              return (
                <Text key={l.text} style={[s.line, i > 0 && s.rest, l.tone === 'warn' && s.warn]} testID="confirm-line">{l.text}</Text>
              );
            })}
          </View>
          <View style={s.buttons}>
            <Button label={req.cancelLabel} variant="secondary" onPress={() => answer(false)} testID="confirm-cancel" />
            <Button label={req.okLabel} onPress={() => answer(true)} testID="confirm-ok" />
          </View>
        </>
      ) : null}
    </Sheet>
  );
  return [ask, question];
}

const s = StyleSheet.create({
  lines: { gap: space.s },
  line: { ...type.body, color: color.t1 },
  rest: { color: color.t2 },
  warn: { color: color.warn },
  // the Buttons pad their touch area by 4 dp above and below: keep that inside this row
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.s, paddingVertical: space.xs },
});
