import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import type { Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { LayoutAnimationConfig } from './layout-animation-config';
import '../register';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

installWrapperHost();
const ROOT_TAG = 19_801;
const update = vi.mocked(updateLayoutAnimations);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
let hostCount = 0;

beforeEach(() => update.mockClear());
afterEach(() => unmount(ROOT_TAG));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });

function enteringSent(): boolean {
  return update.mock.calls.some(([, type]) => {
    return type === LayoutAnimationType.ENTERING;
  });
}

function hostOf(template: string): Type<unknown> {
  hostCount += 1;
  @Component({
    selector: `layout-host-${hostCount}`,
    standalone: true,
    imports: [LayoutAnimationConfig],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template,
  })
  class Host {
    readonly fade = fade;
  }
  return Host;
}

async function mountTemplate(template: string) {
  mount(ROOT_TAG, hostOf(template));
  await tick();
}

describe('LayoutAnimationConfig', () => {
  it('skips the entering animation of the views under it when they mount with it', async () => {
    await mountTemplate(`
      <LayoutAnimationConfig [skipEntering]="true">
        <view [entering]="fade"></view>
      </LayoutAnimationConfig>`);

    expect(enteringSent()).toBe(false);
  });

  it('lets the views under it animate in when it does not skip', async () => {
    await mountTemplate(`
      <LayoutAnimationConfig [skipEntering]="false">
        <view [entering]="fade"></view>
      </LayoutAnimationConfig>`);

    expect(enteringSent()).toBe(true);
  });

  it('skips a view nested under other views, not only its own children', async () => {
    await mountTemplate(`
      <LayoutAnimationConfig [skipEntering]="true">
        <view><view><view [entering]="fade"></view></view></view>
      </LayoutAnimationConfig>`);

    expect(enteringSent()).toBe(false);
  });

  it('leaves views outside it alone', async () => {
    await mountTemplate(`
      <view>
        <LayoutAnimationConfig [skipEntering]="true"></LayoutAnimationConfig>
        <view [entering]="fade"></view>
      </view>`);

    expect(enteringSent()).toBe(true);
  });
});
