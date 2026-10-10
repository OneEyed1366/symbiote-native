// RN 0.85: Pressable no longer drops its listeners while the Activity around it is hidden

import { Activity, useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 12;

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function tap(testID: string): void {
  const view = fabric.find(
    node => node.viewName === 'RCTView' && node.props.testID === testID,
  );
  if (view === undefined)
    throw new Error(`no view created with testID=${testID}`);
  fabric.fireEvent(view.instanceHandle, 'topTouchStart');
  fabric.fireEvent(view.instanceHandle, 'topTouchEnd');
}

describe('a pressable inside an Activity', () => {
  it('still presses after the Activity was hidden and shown again', () => {
    let presses = 0;
    function Toggled(): ReactElement {
      const [isHidden, setIsHidden] = useState(false);
      return (
        <pressable testID="toggle" onPress={() => setIsHidden(value => !value)}>
          <Activity mode={isHidden ? 'hidden' : 'visible'}>
            <pressable testID="inner" onPress={() => (presses += 1)} />
          </Activity>
        </pressable>
      );
    }
    mount(ROOT_TAG, <Toggled />);

    tap('toggle');
    tap('toggle');
    tap('inner');

    expect(presses).toBe(1);
  });
});
