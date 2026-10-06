// Порт `createAnimatedPropsHook-test`: ref ребёнка стабилен между рендерами

import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount, Animated } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

installRecordingFabric();
const ROOT_TAG = 42;

afterEach(() => unmount(ROOT_TAG));

describe('Animated component ref', () => {
  it('does not attach the app ref again when props change', async () => {
    const calls: unknown[] = [];
    let setWidth: ((width: number) => void) | undefined;
    const onRef = (instance: unknown): void => {
      calls.push(instance);
    };

    let renders = 0;
    function App(): ReactElement {
      const [width, setCurrentWidth] = useState(1);
      setWidth = setCurrentWidth;
      renders += 1;
      return <Animated.View ref={onRef} style={{ width }} />;
    }

    mount(ROOT_TAG, <App />);
    await Promise.resolve();
    const attached = calls.length;
    expect(attached).toBe(1);

    setWidth?.(2);
    await new Promise(resolve => setTimeout(resolve, 20));

    // The control: without it a missing re-render would pass the line below
    expect(renders).toBeGreaterThan(1);
    expect(calls.length).toBe(attached);
  });
});
