// Inset application of a nested Angular Stack, the inner header reads the outer one

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import { ScreenDirective } from '../screen.directive';
import type { IAngularScreenOptions } from '../screen.directive';

const ROOT_TAG = 5_116;
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {},
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: {},
    validAttributes: {
      consumeTopInset: true,
      consumeLeftInset: true,
      consumeRightInset: true,
      consumeBottomInset: true,
    },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The host reads this when it is created, so each case sets it before `mount`
let outerScreenOptions: IAngularScreenOptions = {};

@Component({
  selector: 'leaf-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>leaf</text>`,
})
class LeafScreen {}

@Component({
  selector: 'inner-stack',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Leaf">
      <ng-template symbioteScreen name="Leaf" [component]="leaf"></ng-template>
    </Stack>
  `,
})
class InnerStack {
  readonly leaf = LeafScreen;
}

@Component({
  selector: 'nested-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Home">
      <ng-template
        symbioteScreen
        name="Home"
        [component]="inner"
        [options]="options"
      ></ng-template>
    </Stack>
  `,
})
class NestedHost {
  readonly inner = InnerStack;
  readonly options = outerScreenOptions;
}

async function mountNested(options: IAngularScreenOptions) {
  outerScreenOptions = options;
  mount(ROOT_TAG, NestedHost);
  await tick();
  return fabric
    .findAll(node => node.viewName === HEADER_CONFIG_VIEW)
    .map(node => node.props);
}

describe('inset application in a nested Angular Stack', () => {
  it('leaves the top inset to the outer header', async () => {
    const [outer, inner] = await mountNested({});

    expect(outer.consumeTopInset).toBe(true);
    expect(inner.consumeTopInset).toBe(false);
    expect(inner.consumeLeftInset).toBe(true);
  });

  it('passes an edge the outer screen opted out of down to the inner header', async () => {
    const [outer, inner] = await mountNested({
      disableLeftInsetApplication: true,
    });

    expect(outer.consumeLeftInset).toBe(false);
    expect(inner.consumeLeftInset).toBe(false);
    expect(inner.consumeRightInset).toBe(true);
  });
});
