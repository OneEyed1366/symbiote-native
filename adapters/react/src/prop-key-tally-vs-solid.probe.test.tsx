// Extends F-79's closure (`.docs/tree-inefficiency-findings.md`) to the pair CLAUDE.md's own
// device numbers flagged as the LARGER gap and never enumerated: `WRITES` on Create reads
// react 17037/16000 against solid 15001/0 — ~2 000 more real writes per 1 000 rows, not counting
// the 16 000 no-ops F-75 could not price headlessly (the instrument that counted them, `propNoops`,
// was removed by design — see F-75). `propKeyTally` (`core/engine/src/node.ts`, added this round
// for F-79) prices the REAL-write half of that gap directly: one row, reactive push, no CSS rules,
// full 10-node row (view + 3 texts + 2 pressables + text-input — "Ten views, not eleven", both
// `examples/react` and `examples/solid` screens' own comment).
import { useState, type ReactElement } from 'react';
import { describe, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { clearGlobalStyles, takePropKeyTally } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';

globalThis.__SYMBIOTE_DEBUG__ = true;

installRecordingFabric();

const ROOT_TAG = 91_994;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };

// Byte-identical to examples/react/screens/BenchmarkScreen.tsx's own BenchmarkRow (minus `memo` and
// the isSelected class swap, neither of which writes a prop this file's tally would see).
function Row({ row }: { row: IRow }): ReactElement {
  return (
    <view className="bench-row">
      <text className="bench-row-id">{String(row.id)}</text>
      <pressable className="flex1" onPress={() => {}}>
        <text className="bench-row-label">{row.label}</text>
      </pressable>
      <pressable className="bench-row-remove" onPress={() => {}}>
        <text className="bench-row-remove-text">×</text>
      </pressable>
      <text-input className="bench-row-input" value={row.label} />
    </view>
  );
}

let pushRow: ((row: IRow) => void) | undefined;

function App(): ReactElement {
  const [rows, setRows] = useState<readonly IRow[]>([]);
  pushRow = row => setRows(prev => [...prev, row]);
  return (
    <view>
      {rows.map(row => (
        <Row key={row.id} row={row} />
      ))}
    </view>
  );
}

describe('propKeyTally: React reactive push of ONE row vs Solid (F-79 continuation)', () => {
  it('names the exact (component.key) any write-count difference is at', async () => {
    mount(ROOT_TAG, <App />);
    await tick();
    takePropKeyTally(); // discard the empty mount's own cost — price only the reactive push

    pushRow?.({ id: 1, label: 'row label' });
    await tick();

    const tally = takePropKeyTally();
    unmount(ROOT_TAG);
    clearGlobalStyles();

    const total = [...tally.values()].reduce((sum, count) => sum + count, 0);
    const lines = [...tally.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `  ${key}: ${String(count)}`);
    console.log(
      `DEBUG react reactive-push propKeyTally (total=${String(total)}):\n${lines.join('\n')}`,
    );
  });
});
