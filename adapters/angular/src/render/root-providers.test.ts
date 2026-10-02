// App-level providers handed to bootstrap reach the root injector

import '@angular/compiler';
import { Component, InjectionToken, inject } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, setRootProviders, unmount } from '.';

const ROOT_TAG = 214;
const GREETING = new InjectionToken<string>('greeting');
const resolved: string[] = [];

class ProbeComponent {
  constructor() {
    resolved.push(inject(GREETING));
  }
}
Component({
  selector: 'symbiote-root-providers-probe',
  standalone: true,
  template: '',
})(ProbeComponent);

installRecordingFabric();

afterEach(() => {
  unmount(ROOT_TAG);
  setRootProviders([]);
  resolved.length = 0;
});

describe('setRootProviders (Positive)', () => {
  it('resolves a provider in the mounted root component', () => {
    setRootProviders([{ provide: GREETING, useValue: 'hello' }]);
    mount(ROOT_TAG, ProbeComponent);
    expect(resolved).toEqual(['hello']);
  });
});
