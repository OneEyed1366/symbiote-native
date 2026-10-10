// RN's `usePressability`: one `Pressability` per component, reconfigured on a new config and reset
// on unmount. The class is RN's own, a fake stands in for it here
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPressabilityLoader } from '@symbiote-native/engine';
import {
  mount,
  unmount,
  usePressability,
  type IPressabilityConfig,
  type IPressabilityHandlers,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_440;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const constructed: object[] = [];
const configure = vi.fn();
const reset = vi.fn();
const received = vi.fn();

class FakePressability {
  constructor(config: object) {
    constructed.push(config);
  }
  configure = configure;
  reset = reset;
  getEventHandlers(): IPressabilityHandlers {
    return { onResponderGrant: received };
  }
}

let seen: (IPressabilityHandlers | null)[] = [];
let setConfig: ((config: IPressabilityConfig | null) => void) | undefined;

function Probe(props: { first: IPressabilityConfig | null }): null {
  const [config, update] = useState(props.first);
  setConfig = update;
  seen.push(usePressability(config));
  return null;
}

beforeEach(() => {
  fabric.reset();
  constructed.length = 0;
  seen = [];
  configure.mockClear();
  reset.mockClear();
  received.mockClear();
  setPressabilityLoader(() => FakePressability);
});
afterEach(() => unmount(ROOT_TAG));

describe('usePressability', () => {
  it('answers null without a config and builds nothing', async () => {
    mount(ROOT_TAG, <Probe first={null} />);
    await tick();

    expect(seen.at(-1)).toBeNull();
    expect(constructed).toHaveLength(0);
  });

  it('builds one Pressability from the first config', async () => {
    const first = { onPress: () => {} };
    mount(ROOT_TAG, <Probe first={first} />);
    await tick();
    setConfig?.({ onPress: () => {} });
    await tick();

    expect(constructed).toEqual([first]);
  });

  it('reconfigures the same instance with a new config', async () => {
    mount(ROOT_TAG, <Probe first={{ onPress: () => {} }} />);
    await tick();
    const next = { onPress: () => {}, delayLongPress: 300 };
    setConfig?.(next);
    await tick();

    expect(configure).toHaveBeenLastCalledWith(next);
  });

  it('resets the instance on unmount only', async () => {
    mount(ROOT_TAG, <Probe first={{ onPress: () => {} }} />);
    await tick();
    setConfig?.({ onPress: () => {} });
    await tick();

    expect(reset).not.toHaveBeenCalled();

    unmount(ROOT_TAG);

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('returns the same handlers on every render', async () => {
    mount(ROOT_TAG, <Probe first={{ onPress: () => {} }} />);
    await tick();
    setConfig?.({ onPress: () => {} });
    await tick();

    expect(new Set(seen).size).toBe(1);
  });

  // RN's synthetic events carry `persist()`, which `Pressability` calls before it keeps one
  it('hands RN a Pressability event that can persist', async () => {
    mount(ROOT_TAG, <Probe first={{ onPress: () => {} }} />);
    await tick();
    const event = { type: 'responderGrant', nativeEvent: { timestamp: 1 } };
    Reflect.apply(Object(seen.at(-1)).onResponderGrant, undefined, [event]);
    const passed = received.mock.calls[0]?.[0];

    expect(passed.nativeEvent).toBe(event.nativeEvent);
    expect(() => passed.persist()).not.toThrow();
  });
});
