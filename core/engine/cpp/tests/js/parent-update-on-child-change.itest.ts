// A parent whose only change is its child list must not reach the platform as an `Update`

import { createRoot, render, takeLogs, view } from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const PARENT_STYLE = { height: 20, width: 20 };
const CHILD_STYLE = { height: 10, width: 10 };

describe('parent mount logs on child-list change', () => {
  beforeEach(() => createRoot(100, 100));

  it('adds a child without updating the parent', () => {
    render(view({ nativeID: 'parent', style: PARENT_STYLE }));
    takeLogs();

    render(
      view(
        { nativeID: 'parent', style: PARENT_STYLE },
        view({ nativeID: 'child', style: CHILD_STYLE }),
      ),
    );

    expect(takeLogs()).toEqual([
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: "parent", index: 0, nativeID: "child"}',
    ]);
  });

  it('removes a child without updating the parent', () => {
    render(
      view(
        { nativeID: 'parent', style: PARENT_STYLE },
        view({ nativeID: 'child', style: CHILD_STYLE }),
      ),
    );
    takeLogs();

    render(view({ nativeID: 'parent', style: PARENT_STYLE }));

    expect(takeLogs()).toEqual([
      'Remove {type: "View", parentNativeID: "parent", index: 0, nativeID: "child"}',
      'Delete {type: "View", nativeID: "child"}',
    ]);
  });
});

report();
