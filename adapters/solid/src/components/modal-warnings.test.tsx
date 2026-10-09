// RN's Modal warns in a dev build about prop combinations the platform cannot honour

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Modal } from './modal';

const ROOT_TAG = 819;
const PAGE_SHEET_WARNING =
  "Modal with 'pageSheet' presentation style and 'transparent' value is not supported.";

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, '__DEV__');
  vi.restoreAllMocks();
});

function mountMisused(): void {
  mount(ROOT_TAG, () => (
    <Modal visible transparent presentationStyle="pageSheet">
      <view />
    </Modal>
  ));
}

describe('Solid Modal dev warnings', () => {
  it('warns in a dev build about a prop combination RN cannot honour', async () => {
    Reflect.set(globalThis, '__DEV__', true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mountMisused();
    await tick();

    expect(warn).toHaveBeenCalledWith(PAGE_SHEET_WARNING);
  });

  it('stays quiet in a release build', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mountMisused();
    await tick();

    expect(warn).not.toHaveBeenCalled();
  });
});
