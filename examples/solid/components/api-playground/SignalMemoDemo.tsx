// Reactive Primitives — createSignal / createMemo / untrack.
//
// The point a DOM demo cannot make: on this renderer there is no reconciler, so a signal read in
// JSX is wired straight to one native prop. Nothing above the leaf re-runs, and the memo-run
// counter below is the observable proof — it stays put while `noise` climbs.

import { createMemo, createSignal, untrack } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.primitives;

export function SignalMemoDemo() {
  const [count, setCount] = createSignal(0);
  const [noise, setNoise] = createSignal(0);

  // A plain local, not a signal: it is written from inside the memo and read only through the
  // memo's own return value, so making it reactive would be a self-referential loop.
  let memoRuns = 0;
  const doubled = createMemo(() => {
    memoRuns += 1;
    return count() * 2;
  });

  // untrack severs the dependency: `noise` is read here, and the derived line below still never
  // re-runs when it changes. Contrast the `count()` read one line up, which does.
  const summary = createMemo(
    () => `count=${count()} · noise-at-last-count-change=${untrack(noise)}`,
  );

  return (
    <View class="section-nested">
      <Text class="section-label">createSignal · createMemo · untrack</Text>
      <Text class="ap-value" testID="signal-doubled">
        {`doubled = ${doubled()} · memo body ran ${memoRuns}×`}
      </Text>
      <Text class="ap-value" testID="signal-summary">
        {summary()}
      </Text>
      <Text class="subtle">{`noise = ${noise()}`}</Text>
      <View class="ap-wrap">
        <ActionButton
          testID="signal-count"
          title="count + 1"
          color={ACCENT}
          onPress={() => setCount(value => value + 1)}
        />
        <ActionButton
          testID="signal-noise"
          title="noise + 1 (memo must not re-run)"
          color={ACCENT}
          onPress={() => setNoise(value => value + 1)}
        />
      </View>
    </View>
  );
}
