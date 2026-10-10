// `TextInput.js:736-743`: a string inside `<text-input>` is its content, not an error
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 91_051;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'text-input-children-fixture',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<text-input>hello World!</text-input>`,
})
class ChildrenFixture {}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular <text-input> text children', () => {
  it('takes a string child as its content', async () => {
    mount(ROOT_TAG, ChildrenFixture);
    await tick();

    const input = fabric.find(one => one.viewName.includes('TextInput'));
    expect(input?.children.map(child => child.viewName)).toEqual([
      'RCTRawText',
    ]);
  });
});
