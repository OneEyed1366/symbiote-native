// RN's `Mounting-itest`, reconciliation of `setNativeProps` and a React commit

import { createElement } from 'react';

import { createRoot, render, runTask } from './culling-fixture';
import { rendered, rnView } from './mounting-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

type INativePropsTarget = {
  setNativeProps: (props: Record<string, unknown>) => void;
};

function isNativePropsTarget(value: unknown): value is INativePropsTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'setNativeProps' in value &&
    typeof value.setNativeProps === 'function'
  );
}

// A view whose ref is kept, so the test can call `setNativeProps` on it
function mountWithRef(props: Record<string, unknown>): {
  target: () => INativePropsTarget;
} {
  let current: unknown;
  const ref = (value: unknown): void => {
    current = value;
  };
  render(createElement('view', { ref, ...props }));
  return {
    target: () => {
      if (!isNativePropsTarget(current))
        throw new Error('the ref has no setNativeProps');
      return current;
    },
  };
}

describe('reconciliation of setNativeProps and React commit', () => {
  beforeEach(() => createRoot(100, 100));

  it('keeps props set by setNativeProps through a React commit', () => {
    const view = mountWithRef({
      nativeID: 'first native id',
      testID: 'first test id',
    });

    expect(rendered(['nativeID', 'testID'])).toEqual([
      rnView({ nativeID: 'first native id', testID: 'first test id' }),
    ]);

    runTask(() => view.target().setNativeProps({ testID: 'second test id' }));

    expect(rendered(['nativeID', 'testID'])).toEqual([
      rnView({ nativeID: 'first native id', testID: 'second test id' }),
    ]);

    // React does not know `testID` changed, so it treats the prop as unchanged
    render(
      createElement('view', {
        ref: () => {},
        nativeID: 'second native id',
        testID: 'first test id',
      }),
    );

    expect(rendered(['nativeID', 'testID'])).toEqual([
      rnView({ nativeID: 'second native id', testID: 'second test id' }),
    ]);
  });

  it('lets a React commit override a value set by setNativeProps', () => {
    const view = mountWithRef({ nativeID: 'first native id' });

    expect(rendered(['nativeID'])).toEqual([
      rnView({ nativeID: 'first native id' }),
    ]);

    runTask(() =>
      view.target().setNativeProps({ nativeID: 'second native id' }),
    );

    expect(rendered(['nativeID'])).toEqual([
      rnView({ nativeID: 'second native id' }),
    ]);

    render(
      createElement('view', { ref: () => {}, nativeID: 'third native id' }),
    );

    expect(rendered(['nativeID'])).toEqual([
      rnView({ nativeID: 'third native id' }),
    ]);
  });
});

report();
