// The counters exist to be believed on a device, where nothing else can check them - so the wiring
// is pinned here. An instrument that silently reads 0 because a call site was never added is worse
// than no instrument: it reads as "Angular is clean" and sends the next session hunting elsewhere.
import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import {
  readAngularProfile,
  readAngularProfileDetail,
  setAngularProfileDetail,
} from './diagnostics';

const ROOT_TAG = 9941;
installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let host: CounterApp | undefined;

class CounterApp {
  readonly label = signal('first');

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}
Component({
  selector: 'symbiote-counter-test',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<symbiote-view [testID]="label()"></symbiote-view>`,
})(CounterApp);

beforeEach(() => {
  host = undefined;
  setAngularProfileDetail(false);
  readAngularProfile();
});
afterEach(() => unmount(ROOT_TAG));

describe('the Angular profile counts what the renderer actually did', () => {
  it('counts a change-detection pass, the node it created and the prop it wrote', async () => {
    mount(ROOT_TAG, CounterApp);
    await tick();

    const profile = readAngularProfile();
    expect(profile.cdPasses, 'RendererFactory2.end() runs once per tick').toBeGreaterThan(0);
    expect(profile.nodesCreated).toBeGreaterThan(0);
    expect(profile.rendererWrites).toBeGreaterThan(0);
  });

  // why: the sampler reads on an interval and every window must be disjoint, exactly like
  // readCommitProfile. A counter that accumulated across reads would report a growing total that
  // looks like a worsening leak.
  it('zeroes on read', async () => {
    mount(ROOT_TAG, CounterApp);
    await tick();
    readAngularProfile();

    expect(readAngularProfile().cdPasses).toBe(0);
  });

  // why: this is the counter the whole screen turns on - a change-detection pass with no input.
  // A quiet app must add nothing after its first paint.
  it('adds no passes while nothing changes', async () => {
    mount(ROOT_TAG, CounterApp);
    await tick();
    readAngularProfile();

    await tick();
    await tick();

    expect(readAngularProfile().cdPasses, 'idle must be silent').toBe(0);
  });

  it('names the prop it rewrote once detail is on', async () => {
    mount(ROOT_TAG, CounterApp);
    await tick();
    setAngularProfileDetail(true);
    readAngularProfileDetail();

    host?.label.set('second');
    await tick();

    const named = readAngularProfileDetail().writesByProp.map(([name]) => name);
    expect(named).toContain('testID');
  });
});
