// Inset application of a nested Solid Stack, the inner header reads what the outer one already took

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { ISolidScreenOptions } from '../screen-props';

const ROOT_TAG = 7_716;
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

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const Leaf = () => <text>leaf</text>;

const InnerStack = () => (
  <Stack initialRouteName="Leaf">
    <Stack.Screen name="Leaf" component={Leaf} />
  </Stack>
);

async function mountNested(outerOptions: ISolidScreenOptions) {
  mount(ROOT_TAG, () => (
    <Stack initialRouteName="Home">
      <Stack.Screen name="Home" component={InnerStack} options={outerOptions} />
    </Stack>
  ));
  await flush();
  return fabric
    .findAll(node => node.viewName === HEADER_CONFIG_VIEW)
    .map(node => node.props);
}

describe('inset application in a nested Solid Stack', () => {
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
