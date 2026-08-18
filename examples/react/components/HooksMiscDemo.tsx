import { useDebugValue, useId, useState, useSyncExternalStore } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { CaveatNote } from './CaveatNote';
import { LINE_COLOR } from '../navigation-lines';

// A plain external store — no React involved in its own state, exactly the shape
// useSyncExternalStore exists for (compare create-tunnel.tsx's Out, the in-repo precedent).
let externalCount = 0;
const listeners = new Set<() => void>();
function bumpExternalCount(): void {
  externalCount += 1;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getExternalSnapshot(): number {
  return externalCount;
}

function useToggleFlag(initial: boolean): [boolean, () => void] {
  const [flag, setFlag] = useState(initial);
  // useDebugValue: labels this custom hook's value in React DevTools — mechanically fires fine,
  // there's just no DevTools panel wired up (host-config.ts never calls
  // reconciler.injectIntoDevTools) to actually display the label.
  useDebugValue(flag ? 'on' : 'off');
  return [flag, () => setFlag(current => !current)];
}

export function HooksMiscDemo() {
  const [flag, toggleFlag] = useToggleFlag(false);
  const id = useId();
  const externalValue = useSyncExternalStore(subscribe, getExternalSnapshot);

  return (
    <View className="section-nested">
      <Text className="section-label">
        useDebugValue · useId · useSyncExternalStore
      </Text>
      <Text
        testID="hooks-misc-id"
        className="info-text"
      >{`useId(): ${id}`}</Text>
      <Text className="info-text">{`custom hook flag (useDebugValue-labeled): ${flag ? 'on' : 'off'}`}</Text>
      <ActionButton
        testID="hooks-misc-toggle"
        title="Toggle flag"
        onPress={toggleFlag}
        color={LINE_COLOR.introspection}
      />
      <Text
        testID="hooks-misc-external"
        className="info-text"
      >{`useSyncExternalStore reads: ${externalValue}`}</Text>
      <ActionButton
        testID="hooks-misc-bump"
        title="Bump external store"
        onPress={bumpExternalCount}
        color={LINE_COLOR.introspection}
      />
      <CaveatNote testID="hooks-misc-caveat">
        useDebugValue has no DevTools panel to show its label in — this app
        never calls reconciler.injectIntoDevTools, so the hook runs but nothing
        displays it.
      </CaveatNote>
    </View>
  );
}
