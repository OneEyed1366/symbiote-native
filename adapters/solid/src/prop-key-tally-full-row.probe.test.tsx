// Twin of adapters/react/src/prop-key-tally-vs-solid.probe.test.tsx — read that file's header for
// why. Full 10-node row this time (the earlier prop-key-tally-vs-angular.probe.test.tsx in this
// same package used the 9-node no-text-input shape, matching F-79's own historical scope; this one
// adds the text-input back for the React comparison, which CLAUDE.md's own device numbers flagged
// specifically on Create/the full row).
import { describe, it } from 'vitest';
import { createSignal, For } from 'solid-js';
import { clearGlobalStyles, takePropKeyTally } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './index';

globalThis.__SYMBIOTE_DEBUG__ = true;

installRecordingFabric();

const ROOT_TAG = 91_993;
const noop = (): void => {};

type IRow = { id: number; label: string };

function Row(props: { row: IRow }) {
  return (
    <view class="bench-row">
      <text class="bench-row-id">{String(props.row.id)}</text>
      <pressable class="flex1" onPress={noop}>
        <text class="bench-row-label">{props.row.label}</text>
      </pressable>
      <pressable class="bench-row-remove" onPress={noop}>
        <text class="bench-row-remove-text">x</text>
      </pressable>
      <text-input class="bench-row-input" value={props.row.label} />
    </view>
  );
}

const [rows, setRows] = createSignal<readonly IRow[]>([]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

describe('propKeyTally: Solid reactive push of ONE full (10-node) row', () => {
  it('names the exact (component.key) any write-count difference is at', async () => {
    setRows([]);
    const surface = mount(ROOT_TAG, () => (
      <view>
        <For each={rows()}>{row => <Row row={row} />}</For>
      </view>
    ));
    await tick();
    takePropKeyTally();

    setRows([{ id: 1, label: 'row label' }]);
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
      `DEBUG solid reactive-push full-row propKeyTally (total=${String(total)}):\n${lines.join('\n')}`,
    );
  });
});
