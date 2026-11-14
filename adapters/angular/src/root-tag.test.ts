// The tag of the surface a component is rendered into, the Angular twin of RN's `RootTagContext`
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectRootTag } from './root-tag';
import { mount, unmount } from './render';

const FIRST_TAG = 90_480;
const SECOND_TAG = 90_481;
const fabric = installRecordingFabric();
const seen: number[] = [];

beforeEach(() => {
  fabric.reset();
  seen.length = 0;
});
afterEach(() => {
  unmount(FIRST_TAG);
  unmount(SECOND_TAG);
});

describe('injectRootTag', () => {
  it('carries the tag a component is mounted under', () => {
    @Component({ selector: 'root-tag-first', standalone: true, template: '' })
    class First {
      constructor() {
        seen.push(injectRootTag());
      }
    }
    mount(FIRST_TAG, First);

    expect(seen).toEqual([FIRST_TAG]);
  });

  it('answers each surface with its own tag', () => {
    @Component({ selector: 'root-tag-second', standalone: true, template: '' })
    class Second {
      constructor() {
        seen.push(injectRootTag());
      }
    }
    mount(FIRST_TAG, Second);
    mount(SECOND_TAG, Second);

    expect(seen).toEqual([FIRST_TAG, SECOND_TAG]);
  });

  it('throws outside an injection context, as inject() does', () => {
    expect(() => injectRootTag()).toThrow(/NG0203/);
  });
});
