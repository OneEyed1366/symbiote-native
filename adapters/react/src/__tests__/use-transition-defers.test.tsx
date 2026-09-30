// Ground-truth check, not an assumption: does a transition-lane update actually stay
// pending across the synchronous mount call, or does something in this adapter force it
// to commit immediately alongside the sync render (defeating useTransition entirely)?

import { useEffect, useState, useTransition, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 216;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

afterEach(() => {
  fabric.reset();
  unmount(ROOT_TAG);
});

function App(): ReactElement {
  const [value, setValue] = useState('a');
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => setValue('b'));
  }, []);

  return <text testID="value">{value}</text>;
}

describe('useTransition', () => {
  it('does not force the deferred update to commit inside the synchronous mount call', () => {
    mount(ROOT_TAG, <App />);

    expect(live.texts(live.appRoot())).toEqual(['a']);
  });

  it('commits the deferred value once the transition lane is allowed to flush', async () => {
    mount(ROOT_TAG, <App />);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(live.texts(live.appRoot())).toEqual(['b']);
  });
});
