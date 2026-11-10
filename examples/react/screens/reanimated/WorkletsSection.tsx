import { useRef, useState } from 'react';
import {
  isWorkletFunction,
  runOnJS,
  runOnUI,
} from '@symbiote-native/reanimated/react';
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
import { Section } from './Section';

const RUN_COLOR = '#4ea1ff';
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
  const [lines, setLines] = useState<string[]>([]);
  const runtime = useRef<WorkletRuntime | null>(null);

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

  const onRuntime = () => {
    runtime.current ??= createWorkletRuntime('demo');
    const own = runtime.current;
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
      <text className="ra-note">{`isWorkletFunction: ${isHelloAWorklet}`}</text>
      <view className="ra-wrap">
        <ActionButton
          testID="ra-worklet-ui"
          title="scheduleOnUI"
          onPress={onUI}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-worklet-sync"
          title="runOnUISync"
          onPress={onUISync}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-worklet-upstream"
          title="runOnUI + runOnJS"
          onPress={onDeprecatedPair}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-worklet-runtime"
          title="own runtime"
          onPress={onRuntime}
          color={RUN_COLOR}
        />
      </view>
      {lines.map((line, at) => (
        <text key={`${at}-${line}`} className="ra-log">
          {line}
        </text>
      ))}
    </Section>
  );
}
