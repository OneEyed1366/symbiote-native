// RN's `SyncOnCommit-itest`: a row that grows and then clones a nested child must still lay out

import type { ReactElement } from 'react';

import { createRoot, render, view } from './culling-fixture';
import { rendered, rnView } from './mounting-fixture';
import { beforeEach, describe, expect, it } from './harness';

const CELL = { width: 100, height: 32 };
const KEYS = ['layoutMetrics-frame', 'nativeID'] as const;

function cell(id: string, ...children: ReactElement[]): ReactElement {
  return view({ key: id, nativeID: id, style: CELL }, ...children);
}

function row(...children: ReactElement[]): ReactElement {
  return view(
    { nativeID: 'parent', style: { flex: 1, flexDirection: 'row' } },
    ...children,
  );
}

function inner(extra: Record<string, unknown> = {}): ReactElement {
  return view({ key: 'sub', nativeID: 'sub-child-2-1', ...extra });
}

function frame(x: number, width: number, height: number): string {
  return `{x:${x},y:0,width:${width},height:${height}}`;
}

export function defineSyncOnCommitCases(): void {
  describe('Render updates with passChildrenWhenCloningPersistedNodes', () => {
    beforeEach(() => createRoot(390, 844));

    it('updates the runtime shadow node reference correctly when using sync on commit', () => {
      render(row(cell('initial-child-1'), cell('initial-child-2', inner())));

      // New items go between and after the previous two
      render(
        row(
          cell('initial-child-1'),
          cell('inserted-child-1'),
          cell('initial-child-2', inner()),
          cell('inserted-child-2'),
          cell('inserted-child-3'),
        ),
      );

      // A prop on the nested child forces a clone of the original row item
      render(
        row(
          cell('initial-child-1'),
          cell('inserted-child-1'),
          cell(
            'initial-child-2',
            inner({ testID: 'prop-change-to-force-clone' }),
          ),
          cell('inserted-child-2'),
          cell('inserted-child-3'),
        ),
      );

      const item = (
        id: string,
        x: number,
        ...children: ReturnType<typeof rnView>[]
      ) =>
        rnView(
          { 'layoutMetrics-frame': frame(x, 100, 32), nativeID: id },
          ...children,
        );

      expect(rendered(KEYS)).toEqual([
        rnView(
          { 'layoutMetrics-frame': frame(0, 390, 844), nativeID: 'parent' },
          item('initial-child-1', 0),
          item('inserted-child-1', 100),
          item(
            'initial-child-2',
            200,
            rnView({
              'layoutMetrics-frame': frame(0, 100, 0),
              nativeID: 'sub-child-2-1',
            }),
          ),
          item('inserted-child-2', 300),
          item('inserted-child-3', 400),
        ),
      ]);
    });
  });
}
