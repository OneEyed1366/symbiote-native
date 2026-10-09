/** @jsxRuntime automatic */
// RN #51878: a ref callback that returns a cleanup function must get its cleanup, not `null`

import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 35;

installRecordingFabric();
afterEach(() => unmount(ROOT_TAG));

type IEvents = string[];

function recordingRef(events: IEvents) {
  return (instance: unknown): (() => void) => {
    events.push(instance === null ? 'null' : 'attach');
    return () => events.push('cleanup');
  };
}

let toggle: (() => void) | undefined;

function Host({
  events,
  list,
}: {
  events: IEvents;
  list: boolean;
}): ReactElement {
  const [isShown, setIsShown] = useState(true);
  toggle = () => setIsShown(false);
  if (!isShown) return <view />;
  return list ? (
    <FlatList
      horizontal
      data={[1]}
      renderItem={() => <view />}
      ref={recordingRef(events)}
    />
  ) : (
    <scroll-view ref={recordingRef(events)} />
  );
}

describe('a ref callback with a cleanup', () => {
  it.each([
    ['scroll-view', false],
    ['horizontal FlatList', true],
  ])('%s calls the cleanup on unmount, never null', async (_name, list) => {
    const events: IEvents = [];
    mount(ROOT_TAG, <Host events={events} list={list} />);

    toggle?.();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(events).toEqual(['attach', 'cleanup']);
  });
});
