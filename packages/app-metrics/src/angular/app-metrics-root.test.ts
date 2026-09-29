// Angular twin of ../react, ../vue, ../solid and ../svelte's root tests (ADR 0025). No boundary
// counterpart yet - see this package's README "Scope decision" for the Babel/linker version gate

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { AppMetricsRoot } from './app-metrics-root';

const { markFirstRender } = vi.hoisted(() => ({ markFirstRender: vi.fn() }));

vi.mock('../core', () => ({ markFirstRender }));

const ROOT_TAG = 977;
const fabric = installRecordingFabric();

let childMounted = false;

@Component({
  selector: 'app-metrics-root-child-probe',
  standalone: true,
  template: '',
})
class ChildProbe {
  constructor() {
    childMounted = true;
  }
}

@Component({
  selector: 'app-metrics-root-host',
  standalone: true,
  imports: [AppMetricsRoot, ChildProbe],
  template:
    '<app-metrics-root><app-metrics-root-child-probe /></app-metrics-root>',
})
class Host {}

beforeEach(() => {
  vi.clearAllMocks();
  childMounted = false;
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('AppMetricsRoot (Positive: marks first render, projects content)', () => {
  it('marks the first render once mounted', () => {
    mount(ROOT_TAG, Host);

    expect(markFirstRender).toHaveBeenCalledTimes(1);
  });

  it('renders the projected content', () => {
    mount(ROOT_TAG, Host);

    expect(childMounted).toBe(true);
  });
});
