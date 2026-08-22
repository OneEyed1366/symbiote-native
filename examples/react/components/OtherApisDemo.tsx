import { act, startTransition, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { CaveatNote } from './CaveatNote';
import { LINE_COLOR } from '../navigation-lines';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

export function OtherApisDemo() {
  const [label, setLabel] = useState('idle');
  const [actLog, setActLog] = useState('not run yet');

  const onStartTransition = (): void => {
    // startTransition: the module-level twin of useTransition's start function — no
    // component-level isPending handle, just "mark this update as non-urgent".
    startTransition(() => {
      setLabel('updated via startTransition');
    });
  };

  const onRunAct = (): void => {
    // act() expects an act-aware host; app code isn't normally a testing environment, so this
    // opts in just for the demo then reverts — the same flag
    // @symbiote-native/test-utils' headless harness sets for every real test file.
    const previousFlag = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      act(() => {
        setActLog(`ran inside act() at ${Date.now()}`);
      });
    } finally {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousFlag;
    }
  };

  return (
    <View className="section-nested">
      <Text className="section-label">startTransition · act</Text>
      <Text
        testID="other-transition-label"
        className="info-text"
      >{`startTransition: ${label}`}</Text>
      <ActionButton
        testID="other-start-transition"
        title="Update via startTransition"
        onPress={onStartTransition}
        color={LINE_COLOR.introspection}
      />
      <CaveatNote testID="other-transition-caveat">
        Same LegacyRoot caveat as useTransition — this update still lands on the
        sync lane and flushes immediately, so there's no non-urgent scheduling
        to observe.
      </CaveatNote>
      <Text
        testID="other-act-log"
        className="info-text"
      >{`act(): ${actLog}`}</Text>
      <ActionButton
        testID="other-run-act"
        title="Run a state update inside act()"
        onPress={onRunAct}
        color={LINE_COLOR.introspection}
      />
    </View>
  );
}
