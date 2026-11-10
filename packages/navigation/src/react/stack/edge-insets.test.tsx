// Inset application of a nested React Stack, the inner header reads what the outer one already took

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { IReactScreenOptions } from '../screen';

const ROOT_TAG = 516;
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function InnerStack(): ReturnType<typeof createElement> {
  return createElement(
    Stack,
    { initialRouteName: 'Leaf' },
    createElement(Stack.Screen, {
      name: 'Leaf',
      component: () => createElement('text', {}, 'leaf'),
    }),
  );
}

function mountNested(outerOptions: IReactScreenOptions) {
  mount(
    ROOT_TAG,
    createElement(
      Stack,
      { initialRouteName: 'Home' },
      createElement(Stack.Screen, {
        name: 'Home',
        component: InnerStack,
        options: outerOptions,
      }),
    ),
  );
  return fabric
    .findAll(node => node.viewName === HEADER_CONFIG_VIEW)
    .map(node => node.props);
}

describe('inset application in a nested React Stack', () => {
  it('leaves the top inset to the outer header', () => {
    const [outer, inner] = mountNested({});

    expect(outer.consumeTopInset).toBe(true);
    expect(inner.consumeTopInset).toBe(false);
    expect(inner.consumeLeftInset).toBe(true);
  });

  it('passes an edge the outer screen opted out of down to the inner header', () => {
    const [outer, inner] = mountNested({ disableLeftInsetApplication: true });

    expect(outer.consumeLeftInset).toBe(false);
    expect(inner.consumeLeftInset).toBe(false);
    expect(inner.consumeRightInset).toBe(true);
  });
});
