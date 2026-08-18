// Lifecycle — onMount · onCleanup.
//
// There is no "re-render" to hang either of these on: a Solid body runs once, so onMount is the
// only place a host ref is guaranteed to exist and onCleanup is the only place teardown happens.
// The child below is mounted and unmounted from a <Show>, so both fire visibly and the log keeps
// the pairing honest — one mount line per unmount line, always.

import { Index, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.introspection;
const LOG_LIMIT = 6;

function TickingChild(props: { log: (line: string) => void }) {
  const [ticks, setTicks] = createSignal(0);

  onMount(() => {
    props.log('child onMount');
    const timer = setInterval(() => setTicks(value => value + 1), 500);
    // Registered from INSIDE onMount and still correct: onMount runs under the component's owner,
    // so the cleanup belongs to the component, not to the mount callback.
    onCleanup(() => {
      clearInterval(timer);
      props.log('child onCleanup');
    });
  });

  return (
    <View class="ap-panel">
      <Text class="ap-value" testID="lifecycle-child">
        {`child alive · ${ticks()} ticks`}
      </Text>
    </View>
  );
}

export function LifecycleDemo() {
  const [alive, setAlive] = createSignal(false);
  const [log, setLog] = createSignal<readonly string[]>([]);

  const push = (line: string): void => {
    setLog(previous => [...previous, line].slice(-LOG_LIMIT));
  };

  onMount(() => push('screen section onMount'));

  return (
    <View class="section-nested">
      <Text class="section-label">onMount · onCleanup</Text>
      <ActionButton
        testID="lifecycle-toggle"
        title={alive() ? 'unmount child' : 'mount child'}
        color={ACCENT}
        onPress={() => setAlive(value => !value)}
      />
      <Show when={alive()}>
        <TickingChild log={push} />
      </Show>
      <View class="ap-log" testID="lifecycle-log">
        <Index each={log()}>
          {line => <Text class="ap-log-line">{line()}</Text>}
        </Index>
      </View>
    </View>
  );
}
