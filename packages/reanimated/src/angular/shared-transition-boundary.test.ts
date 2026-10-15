import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import type { Type } from '@angular/core';
import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/angular';
import { afterEach, describe, expect, it } from 'vitest';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { SharedTransitionBoundary } from './shared-transition-boundary';

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 20_801;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
let hostCount = 0;

afterEach(() => {
  unmount(ROOT_TAG);
  host.fabric.reset();
});

function boundary() {
  const found = host.fabric.findAll(
    node => node.viewName === 'REASharedTransitionBoundary',
  );
  const [only] = found;
  if (found.length !== 1 || only === undefined) {
    throw new Error(`expected one boundary, found ${found.length}`);
  }
  return live.nodeOf(only.handle);
}

function hostOf(template: string): Type<unknown> {
  hostCount += 1;
  @Component({
    selector: `boundary-host-${hostCount}`,
    standalone: true,
    imports: [SharedTransitionBoundary],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template,
  })
  class Host {}
  return Host;
}

async function mountTemplate(template: string) {
  mount(ROOT_TAG, hostOf(template));
  await tick();
}

describe('SharedTransitionBoundary', () => {
  it('is a native boundary view that carries whether it is active', async () => {
    await mountTemplate(`<SharedTransitionBoundary [isActive]="true" />`);

    expect(boundary().payload.isActive).toBe(true);
  });

  it('takes no part in layout and lets touches through to its children', async () => {
    await mountTemplate(`<SharedTransitionBoundary [isActive]="false" />`);

    expect(boundary().payload).toMatchObject({
      display: 'contents',
      overflow: 'visible',
      pointerEvents: 'box-none',
    });
  });

  it('holds its children', async () => {
    await mountTemplate(`
      <SharedTransitionBoundary [isActive]="true">
        <view testID="inside"></view>
      </SharedTransitionBoundary>`);

    expect(boundary().children.map(child => child.payload.testID)).toEqual([
      'inside',
    ]);
  });
});
