// RN's Modal warns in a dev build about prop combinations the platform cannot honour
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Modal } from './index';

const ROOT_TAG = 913;
const PAGE_SHEET_WARNING =
  "Modal with 'pageSheet' presentation style and 'transparent' value is not supported.";

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-modal-misused-host',
  standalone: true,
  imports: [Modal],
  template: `
    <Modal [visible]="true" [transparent]="true" presentationStyle="pageSheet">
      <text>Hello</text>
    </Modal>
  `,
})
class MisusedHost {}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, '__DEV__');
  vi.restoreAllMocks();
});

describe('Angular Modal dev warnings', () => {
  it('warns in a dev build about a prop combination RN cannot honour', async () => {
    Reflect.set(globalThis, '__DEV__', true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount(ROOT_TAG, MisusedHost);
    await tick();

    expect(warn).toHaveBeenCalledWith(PAGE_SHEET_WARNING);
  });

  it('stays quiet in a release build', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mount(ROOT_TAG, MisusedHost);
    await tick();

    expect(warn).not.toHaveBeenCalled();
  });
});
