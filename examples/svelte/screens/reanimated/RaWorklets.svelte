<script lang="ts">
  import {
    isWorkletFunction,
    runOnJS,
    runOnUI,
  } from '@symbiote-native/reanimated/svelte';
  import {
    createWorkletRuntime,
    runOnRuntimeSync,
    runOnUISync,
    scheduleOnRN,
    scheduleOnRuntime,
    scheduleOnUI,
    type WorkletRuntime,
  } from 'react-native-worklets';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaSection from './RaSection.svelte';

  const KEPT_LINES = 6;
  const ANSWER = 6 * 7;

  const hello = () => {
    'worklet';
    return 'hello';
  };

  const workletNote = `isWorkletFunction: ${isWorkletFunction(hello)}`;

  // Code that runs on the UI runtime, on a runtime of its own, and back on the JS thread. Each
  // button logs what it saw and where it ran
  let lines = $state<string[]>([]);

  const log = (line: string) => {
    lines = [line, ...lines].slice(0, KEPT_LINES);
  };

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
</script>

<RaSection
  title="Worklets"
  note="scheduleOnUI, runOnUISync, scheduleOnRN, createWorkletRuntime and the upstream runOnUI and runOnJS"
>
  <text class="ra-note">{workletNote}</text>
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
  {#each lines as line, at (`${at}-${line}`)}
    <text class="ra-log">{line}</text>
  {/each}
</RaSection>
