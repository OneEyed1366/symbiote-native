// Twin of adapters/angular/src/prop-key-tally-vs-solid.probe.test.ts — read that file's header for
// why this uses a REACTIVE PUSH (mount empty, then push one row via a signal) rather than a static
// mount. Same row shape, same protocol, so the two printouts are directly comparable line by line.
import { describe, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import { clearGlobalStyles, takePropKeyTally } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './index';

globalThis.__SYMBIOTE_DEBUG__ = true;

installRecordingFabric();

const ROOT_TAG = 91_996;
const noop = (): void => {};

function Row(props: { id: number }) {
  return (
    <view class="bench-row">
      <text class="bench-row-id">{String(props.id)}</text>
      <pressable class="flex1" onPress={noop}>
        <text class="bench-row-label">row label</text>
      </pressable>
      <pressable class="bench-row-remove" onPress={noop}>
        <text class="bench-row-remove-text">x</text>
      </pressable>
    </view>
  );
}

const [rows, setRows] = createSignal<readonly number[]>([]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

describe('propKeyTally: Solid reactive push of ONE row (F-79 continuation)', () => {
  it('names the exact (component.key) the residual write difference is at', async () => {
    setRows([]);
    const surface = mount(ROOT_TAG, () => (
      <view class="screen">
        <For each={rows()}>{id => <Row id={id} />}</For>
      </view>
    ));
    await tick();
    takePropKeyTally();

    setRows([1]);
    await tick();

    const tally = takePropKeyTally();
    unmount(ROOT_TAG);
    clearGlobalStyles();
    void surface;

    const total = [...tally.values()].reduce((sum, count) => sum + count, 0);
    const lines = [...tally.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `  ${key}: ${String(count)}`);
    console.log(
      `DEBUG solid reactive-push propKeyTally (total=${String(total)}):\n${lines.join('\n')}`,
    );
  });
});
