// Reactive Primitives — createComputed / createRenderEffect / createEffect / batch / on(defer).
//
// The three computation kinds differ only in WHEN they run, which is invisible unless they log.
// At mount the order is computed → renderEffect → effect: the first two run synchronously as they
// are created, the third is queued and drains after the render pass — i.e. after the engine has
// the nodes. Every later `step` write repeats the same order.
//
// `batch` is the other half: two writes inside one batch move the effect counter by ONE, and the
// engine's own commit is microtask-coalesced underneath, so the burst is a single completeRoot.

import {
  Index,
  batch,
  createComputed,
  createEffect,
  createRenderEffect,
  createSignal,
  on,
} from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.primitives;
const LOG_LIMIT = 8;

export function EffectTimingDemo() {
  const [step, setStep] = createSignal(0);
  const [other, setOther] = createSignal(0);
  const [log, setLog] = createSignal<readonly string[]>([]);

  // The functional setter form does not read the signal reactively, so logging from inside a
  // computation cannot make that computation depend on its own output.
  const push = (line: string): void => {
    setLog(previous => [...previous, line].slice(-LOG_LIMIT));
  };

  let effectRuns = 0;

  createComputed(() => push(`computed      step=${step()}`));
  createRenderEffect(() => push(`renderEffect  step=${step()}`));
  createEffect(() => {
    effectRuns += 1;
    push(`effect        step=${step()} (run #${effectRuns})`);
  });

  // `defer` suppresses the mount-time run, so this line appears only from the FIRST change on.
  // Without it the same effect would fire once at creation with the initial value.
  createEffect(
    on(step, value => push(`on(step, …, { defer: true }) → ${value}`), {
      defer: true,
    }),
  );

  // Reads BOTH signals, so an un-batched pair of writes runs it twice.
  const [pairRuns, setPairRuns] = createSignal(0);
  createEffect(
    on([step, other], () => setPairRuns(runs => runs + 1), { defer: true }),
  );

  return (
    <View class="section-nested">
      <Text class="section-label">
        createComputed · createRenderEffect · createEffect · on(defer) · batch
      </Text>
      <View class="ap-log" testID="effect-timing-log">
        {/* <Index>, not <For>: the log is a rolling window keyed by POSITION, so the row that
            already exists should have its text replaced rather than be rebuilt. Imported
            explicitly — an un-imported control-flow name resolves against the renderer module and
            reads back undefined (.claude/rules/solid-descriptor-bridge.md §3). */}
        <Index each={log()}>
          {line => <Text class="ap-log-line">{line()}</Text>}
        </Index>
      </View>
      <Text class="ap-value" testID="effect-pair-runs">
        {`effect over [step, other] ran ${pairRuns()}× · step=${step()} other=${other()}`}
      </Text>
      <View class="ap-wrap">
        <ActionButton
          testID="effect-step"
          title="step + 1"
          color={ACCENT}
          onPress={() => setStep(value => value + 1)}
        />
        <ActionButton
          testID="effect-unbatched"
          title="write both (unbatched → 2 runs)"
          color={ACCENT}
          onPress={() => {
            setStep(value => value + 1);
            setOther(value => value + 1);
          }}
        />
        <ActionButton
          testID="effect-batched"
          title="write both in batch() → 1 run"
          color={ACCENT}
          onPress={() =>
            batch(() => {
              setStep(value => value + 1);
              setOther(value => value + 1);
            })
          }
        />
      </View>
    </View>
  );
}
