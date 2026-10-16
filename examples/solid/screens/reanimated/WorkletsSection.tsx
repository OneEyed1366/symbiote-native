import { createSignal, For } from 'solid-js';
import {
  isWorkletFunction,
  runOnJS,
  runOnUI,
} from '@symbiote-native/reanimated/solid';
import {
  createWorkletRuntime,
  runOnRuntimeSync,
  runOnUISync,
  scheduleOnRN,
  scheduleOnRuntime,
  scheduleOnUI,
  type WorkletRuntime,
} from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { Section } from './Section';

const KEPT_LINES = 6;
const ANSWER = 6 * 7;

const hello = () => {
  'worklet';
  return 'hello';
};

const isHelloAWorklet = isWorkletFunction(hello);

// Code that runs on the UI runtime, on a runtime of its own, and back on the JS thread. Each
// button logs what it saw and where it ran
export function WorkletsSection() {
  const [lines, setLines] = createSignal<string[]>([]);

  const log = (line: string) =>
    setLines(previous => [line, ...previous].slice(0, KEPT_LINES));

  const onUI = () => {
    scheduleOnUI(() => {
      'worklet';
      scheduleOnRN(log, 'scheduleOnUI ran, then called back with scheduleOnRN');
    });
  };

  const onUISync = () => {
    const answer = runOnUISync(() => {
      'worklet';
      return ANSWER;
    });
    log(`runOnUISync returned ${answer}`);
  };

  const onDeprecatedPair = () => {
    runOnUI(() => {
      'worklet';
      runOnJS(log)('runOnUI and runOnJS, the upstream names');
    })();
  };

  let runtime: WorkletRuntime | null = null;
  const onRuntime = () => {
    runtime ??= createWorkletRuntime('demo');
    const own = runtime;
    scheduleOnRuntime(own, () => {
      'worklet';
      scheduleOnRN(log, 'ran on a worklet runtime of its own');
    });
    log(
      `runOnRuntimeSync returned ${runOnRuntimeSync(own, () => {
        'worklet';
        return ANSWER;
      })}`,
    );
  };

  return (
    <Section
      title="Worklets"
      note="scheduleOnUI, runOnUISync, scheduleOnRN, createWorkletRuntime and the upstream runOnUI and runOnJS"
    >
      <text class="ra-note">{`isWorkletFunction: ${isHelloAWorklet}`}</text>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-worklet-ui"
          title="scheduleOnUI"
          onPress={onUI}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-worklet-sync"
          title="runOnUISync"
          onPress={onUISync}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-worklet-upstream"
          title="runOnUI + runOnJS"
          onPress={onDeprecatedPair}
          color={ACCENT}
        />
        <ActionButton
          testID="ra-worklet-runtime"
          title="own runtime"
          onPress={onRuntime}
          color={ACCENT}
        />
      </view>
      <For each={lines()}>{line => <text class="ra-log">{line}</text>}</For>
    </Section>
  );
}
