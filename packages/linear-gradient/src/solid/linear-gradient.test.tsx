// Solid `LinearGradient` через recording fabric с подставленным view config
import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  setNativeViewConfigSource,
  unmount,
} from '@symbiote-native/solid';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const platform = vi.hoisted(() => ({
  OS: 'ios',
  select(spec: Record<string, unknown>): unknown {
    return spec[this.OS] ?? spec['default'];
  },
}));
const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: platform,
  requireNativeViewManager,
}));

const { LinearGradient } = await import('./linear-gradient');

const ROOT_TAG = 1613;
const VIEW_NAME = 'ViewManagerAdapter_ExpoLinearGradient';
const CHILD_ID = 'content';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
setNativeViewConfigSource(name =>
  name === VIEW_NAME
    ? {
        validAttributes: {
          colors: true,
          locations: true,
          startPoint: true,
          endPoint: true,
          borderRadii: true,
          dither: true,
        },
      }
    : undefined,
);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  platform.OS = 'ios';
});

afterEach(() => unmount(ROOT_TAG));

function gradientNode() {
  const node = fabric.find(candidate => candidate.viewName === VIEW_NAME);
  if (node === undefined) throw new Error('no gradient view was created');
  return live.nodeOf(node.handle);
}

describe('LinearGradient (Positive)', () => {
  it('paints one native view with colors and points on iOS', async () => {
    mount(ROOT_TAG, () => (
      <LinearGradient
        colors={['red', 'blue']}
        start={{ x: 0, y: 0 }}
        end={[1, 1]}
        locations={[0.25, 1]}
      />
    ));
    await tick();

    const { payload } = gradientNode();
    expect(payload.startPoint).toEqual([0, 0]);
    expect(payload.endPoint).toEqual([1, 1]);
    expect(payload.locations).toEqual([0.25, 1]);
    expect(payload.colors).toHaveLength(2);
  });

  it('puts the children inside the native view on iOS', async () => {
    mount(ROOT_TAG, () => (
      <LinearGradient colors={['red', 'blue']}>
        <view testID={CHILD_ID} />
      </LinearGradient>
    ));
    await tick();

    expect(gradientNode().children.map(child => child.payload.testID)).toEqual([
      CHILD_ID,
    ]);
  });

  it('wraps the gradient in a View with the children beside it on Android', async () => {
    platform.OS = 'android';

    mount(ROOT_TAG, () => (
      <LinearGradient
        colors={['red', 'blue']}
        testID="box"
        style={{ borderRadius: 4 }}
      >
        <view testID={CHILD_ID} />
      </LinearGradient>
    ));
    await tick();

    const root = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'box',
    );
    expect(root?.viewName).toBe('RCTView');
    expect(root?.children.map(child => child.viewName)).toEqual([
      VIEW_NAME,
      'RCTView',
    ]);
    expect(gradientNode().payload.borderRadii).toEqual([
      4, 4, 4, 4, 4, 4, 4, 4,
    ]);
  });

  it('repaints the same native view when a color changes after mount', async () => {
    const [color, setColor] = createSignal('red');
    mount(ROOT_TAG, () => <LinearGradient colors={[color(), 'blue']} />);
    await tick();
    const { handle } = gradientNode();
    const colorsBefore = JSON.stringify(gradientNode().payload.colors);

    setColor('green');
    await tick();

    expect(gradientNode().handle).toBe(handle);
    expect(colorsBefore).not.toBe(
      JSON.stringify(gradientNode().payload.colors),
    );
  });

  it('registers the view manager when it renders', async () => {
    mount(ROOT_TAG, () => <LinearGradient colors={['red', 'blue']} />);
    await tick();

    expect(requireNativeViewManager).toHaveBeenCalledWith('ExpoLinearGradient');
  });
});
