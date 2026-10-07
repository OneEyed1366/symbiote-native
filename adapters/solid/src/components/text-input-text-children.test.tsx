// `TextInput.js:736-743`: a string inside `<text-input>` is its content, not an error
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import '../register';
import { mount, unmount } from '../render';

const ROOT_TAG = 914;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Solid <text-input> text children', () => {
  it('takes a string child as its content', async () => {
    mount(ROOT_TAG, () => <text-input>hello World!</text-input>);
    await tick();

    const input = fabric.find(one => one.viewName.includes('TextInput'));
    expect(input?.children.map(child => child.viewName)).toEqual([
      'RCTRawText',
    ]);
  });
});
