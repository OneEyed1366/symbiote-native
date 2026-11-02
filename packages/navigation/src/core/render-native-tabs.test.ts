import { describe, expect, it, vi } from 'vitest';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  NAVIGATION_EVENT_BLUR,
  NAVIGATION_EVENT_FOCUS,
  createNavigationEmitter,
} from './navigation-events';
import type { INavigationEmitter } from './navigation-events';
import { createInitialNativeTabState } from './native-tab-state';
import { resolveNativeTabsView } from './render-native-tabs';
import type { INativeTabsViewInput } from './render-native-tabs';

const ROUTES = [
  { key: 'home-1', name: 'Home', params: undefined },
  { key: 'feed-2', name: 'Feed', params: undefined },
];

function nativeEvent(payload: Record<string, unknown>): ISymbioteEvent {
  return {
    type: 'tabs',
    target: 1,
    currentTarget: 1,
    nativeEvent: payload,
    stopPropagation: () => {},
  };
}

function callProp(
  props: Record<string, unknown>,
  name: string,
  event: ISymbioteEvent,
) {
  const handler = props[name];
  if (typeof handler !== 'function') throw new Error(`no ${name} on the props`);
  handler(event);
}

function buildInput(
  overrides: Partial<INativeTabsViewInput> = {},
): INativeTabsViewInput {
  const emitters = new Map<string, INavigationEmitter>();
  return {
    state: createInitialNativeTabState(ROUTES),
    dispatch: () => {},
    os: 'ios',
    osVersion: '18.0',
    host: {},
    screenOptionsOf: () => ({}),
    emitterFor: key => {
      const emitter = emitters.get(key) ?? createNavigationEmitter();
      emitters.set(key, emitter);
      return emitter;
    },
    hasBottomAccessory: false,
    ...overrides,
  };
}

describe('native tabs view host', () => {
  it('asks native for the focused route with the provenance JS last saw', () => {
    const state = {
      ...createInitialNativeTabState(ROUTES, 'Feed'),
      baseProvenance: 7,
    };

    const { host } = resolveNativeTabsView(buildInput({ state }));

    expect(host.viewName).toBe('RNSTabsHostIOS');
    expect(host.props.navStateRequest).toEqual({
      selectedScreenKey: 'feed-2',
      baseProvenance: 7,
    });
  });

  it('passes the host options of the app through', () => {
    const { host } = resolveNativeTabsView(
      buildInput({ host: { tabBarHidden: true, colorScheme: 'dark' } }),
    );

    expect(host.props).toMatchObject({
      tabBarHidden: true,
      colorScheme: 'dark',
    });
  });

  it('follows the tab the user tapped and then tells the app', () => {
    const dispatch = vi.fn();
    const onTabSelected = vi.fn();
    const { host } = resolveNativeTabsView(
      buildInput({ dispatch, host: { onTabSelected } }),
    );

    callProp(
      host.props,
      'onTabSelected',
      nativeEvent({
        selectedScreenKey: 'feed-2',
        provenance: 3,
        actionOrigin: 'user',
      }),
    );

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'nativeSelected',
      selectedScreenKey: 'feed-2',
      provenance: 3,
    });
    expect(onTabSelected).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ selectedScreenKey: 'feed-2', provenance: 3 }),
    );
  });

  it('follows the tab native keeps when it rejects a request, so JS does not drift', () => {
    const dispatch = vi.fn();
    const onTabSelectionRejected = vi.fn();
    const { host } = resolveNativeTabsView(
      buildInput({ dispatch, host: { onTabSelectionRejected } }),
    );

    callProp(
      host.props,
      'onTabSelectionRejected',
      nativeEvent({
        selectedScreenKey: 'home-1',
        provenance: 5,
        rejectedScreenKey: 'feed-2',
        rejectedBaseProvenance: 4,
        rejectionReason: 'stale',
      }),
    );

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'nativeSelected',
      selectedScreenKey: 'home-1',
      provenance: 5,
    });
    expect(onTabSelectionRejected).toHaveBeenCalledTimes(1);
  });

  it('listens to the prevented selection only when the app does', () => {
    expect(resolveNativeTabsView(buildInput()).host.props).not.toHaveProperty(
      'onTabSelectionPrevented',
    );
    expect(
      resolveNativeTabsView(
        buildInput({ host: { onTabSelectionPrevented: () => {} } }),
      ).host.props,
    ).toHaveProperty('onTabSelectionPrevented');
  });
});

describe('native tabs view screens', () => {
  it('gives each route its own screen in route order, keyed by the route key', () => {
    const { screens } = resolveNativeTabsView(buildInput());

    expect(screens.map(entry => entry.route.key)).toEqual(['home-1', 'feed-2']);
    expect(screens.map(entry => entry.screen.props.screenKey)).toEqual([
      'home-1',
      'feed-2',
    ]);
    expect(screens[0]?.screen.viewName).toBe('RNSTabsScreenIOS');
  });

  it('builds a screen from the options of its own route', () => {
    const { screens } = resolveNativeTabsView(
      buildInput({
        screenOptionsOf: route => ({ title: `title of ${route.name}` }),
      }),
    );

    expect(screens.map(entry => entry.screen.props.title)).toEqual([
      'title of Home',
      'title of Feed',
    ]);
  });

  it('uses the Android screen view on Android', () => {
    const { host, screens } = resolveNativeTabsView(
      buildInput({ os: 'android' }),
    );

    expect(host.viewName).toBe('RNSTabsHostAndroid');
    expect(screens[0]?.screen.viewName).toBe('RNSTabsScreenAndroid');
  });

  it('emits focus on the route emitter when its screen appears, then runs the app callback', () => {
    const emitter = createNavigationEmitter();
    const onFocus = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_FOCUS, onFocus);
    const onDidAppear = vi.fn();
    const { screens } = resolveNativeTabsView(
      buildInput({
        emitterFor: () => emitter,
        screenOptionsOf: () => ({ onDidAppear }),
      }),
    );

    callProp(screens[0]?.screen.props ?? {}, 'onDidAppear', nativeEvent({}));

    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onDidAppear).toHaveBeenCalledTimes(1);
  });

  it('emits blur on the route emitter when its screen disappears', () => {
    const emitter = createNavigationEmitter();
    const onBlur = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_BLUR, onBlur);
    const { screens } = resolveNativeTabsView(
      buildInput({ emitterFor: () => emitter }),
    );

    callProp(screens[0]?.screen.props ?? {}, 'onDidDisappear', nativeEvent({}));

    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('keeps the will appear and will disappear callbacks of the app, with no focus change', () => {
    const emitter = createNavigationEmitter();
    const onFocus = vi.fn();
    emitter.addListener(NAVIGATION_EVENT_FOCUS, onFocus);
    const onWillAppear = vi.fn();
    const { screens } = resolveNativeTabsView(
      buildInput({
        emitterFor: () => emitter,
        screenOptionsOf: () => ({ onWillAppear }),
      }),
    );

    callProp(screens[0]?.screen.props ?? {}, 'onWillAppear', nativeEvent({}));

    expect(onWillAppear).toHaveBeenCalledTimes(1);
    expect(onFocus).not.toHaveBeenCalled();
  });
});

describe('native tabs view bottom accessory', () => {
  it('is absent when the app has no accessory', () => {
    expect(
      resolveNativeTabsView(buildInput({ osVersion: '26.0' })).bottomAccessory,
    ).toBeUndefined();
  });

  it('is present on iOS 26 with an accessory', () => {
    const { bottomAccessory } = resolveNativeTabsView(
      buildInput({ osVersion: '26.0', hasBottomAccessory: true }),
    );

    expect(bottomAccessory?.viewName).toBe('RNSTabsBottomAccessory');
  });
});
