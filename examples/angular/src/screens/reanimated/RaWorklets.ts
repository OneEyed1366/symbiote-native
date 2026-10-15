import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  isWorkletFunction,
  runOnJS,
  runOnUI,
} from '@symbiote-native/reanimated/angular';
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

const KEPT_LINES = 6;
const ANSWER = 6 * 7;

const hello = () => {
  'worklet';
  return 'hello';
};

// A worklet closes over locals of its factory, as `this` does not cross to the UI runtime
function createRuns(log: (line: string) => void) {
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

  return { onUI, onUISync, onDeprecatedPair, onRuntime };
}

// Code that runs on the UI runtime, on a runtime of its own, and back on the JS thread. Each
// button logs what it saw and where it ran
@Component({
  selector: 'RaWorklets',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="ra-section">
      <text class="ra-section-title">Worklets</text>
      <text class="ra-note"
        >scheduleOnUI, runOnUISync, scheduleOnRN, createWorkletRuntime and the
        upstream runOnUI and runOnJS</text
      >
      <text class="ra-note">{{ workletNote }}</text>
      <view class="ra-wrap">
        <ActionButton
          testID="ra-worklet-ui"
          title="scheduleOnUI"
          [color]="accent"
          (press)="runs.onUI()"
        />
        <ActionButton
          testID="ra-worklet-sync"
          title="runOnUISync"
          [color]="accent"
          (press)="runs.onUISync()"
        />
        <ActionButton
          testID="ra-worklet-upstream"
          title="runOnUI + runOnJS"
          [color]="accent"
          (press)="runs.onDeprecatedPair()"
        />
        <ActionButton
          testID="ra-worklet-runtime"
          title="own runtime"
          [color]="accent"
          (press)="runs.onRuntime()"
        />
      </view>
      @for (line of lines(); track $index) {
        <text class="ra-log">{{ line }}</text>
      }
    </view>
  `,
})
export class RaWorklets {
  readonly lines = signal<string[]>([]);
  readonly runs = createRuns(line =>
    this.lines.update(previous => [line, ...previous].slice(0, KEPT_LINES)),
  );
  readonly workletNote = `isWorkletFunction: ${isWorkletFunction(hello)}`;
  readonly accent = ACCENT;
}
