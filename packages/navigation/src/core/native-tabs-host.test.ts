import { describe, expect, it, vi } from 'vitest';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveNativeTabsHost } from './native-tabs-host';
import type { INativeTabsHostOptions } from './native-tabs-host';

const SELECTION = { selectedScreenKey: 'home', baseProvenance: 3 };

function hostOf(options: Partial<INativeTabsHostOptions>, os = 'ios') {
  return resolveNativeTabsHost({ ...SELECTION, ...options }, os);
}

function eventOf(nativeEvent: Record<string, unknown>): ISymbioteEvent {
  const target = { tag: 1 };
  return {
    type: 'event',
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  };
}

function handlerOf(
  props: Record<string, unknown>,
  name: string,
): (event: ISymbioteEvent) => void {
  const handler = props[name];
  if (typeof handler !== 'function') throw new Error(`no ${name} handler`);
  return event => handler(event);
}

describe('native tabs host view', () => {
  it('is the iOS host on iOS and the Android host on Android', () => {
    expect(hostOf({}, 'ios').viewName).toBe('RNSTabsHostIOS');
    expect(hostOf({}, 'android').viewName).toBe('RNSTabsHostAndroid');
  });

  it('falls back to a plain view where the platform has no native tabs', () => {
    const host = hostOf({ tabBarHidden: true }, 'web');

    expect(host.viewName).toBe('view');
    expect(host.props).not.toHaveProperty('tabBarHidden');
  });

  it('fills its parent', () => {
    expect(hostOf({}).props.style).toEqual(
      expect.arrayContaining([{ flex: 1, width: '100%', height: '100%' }]),
    );
  });
});

describe('native tabs host navigation state', () => {
  it('sends the selected screen and the provenance it was based on', () => {
    expect(hostOf({}).props.navStateRequest).toEqual({
      selectedScreenKey: 'home',
      baseProvenance: 3,
    });
  });

  it('sends the stale update guard only when the app sets it', () => {
    expect(hostOf({}).props).not.toHaveProperty('rejectStaleNavStateUpdates');
    expect(
      hostOf({ rejectStaleNavStateUpdates: true }).props
        .rejectStaleNavStateUpdates,
    ).toBe(true);
  });
});

describe('native tabs host general props', () => {
  it('passes the tab bar visibility and color scheme through', () => {
    const { props } = hostOf({ tabBarHidden: true, colorScheme: 'dark' });

    expect(props.tabBarHidden).toBe(true);
    expect(props.colorScheme).toBe('dark');
  });

  it('sends the container background under its native name', () => {
    const { props } = hostOf({
      nativeContainerStyle: { backgroundColor: 'red' },
    });

    expect(props.nativeContainerBackgroundColor).toBe('red');
  });

  it('sends the direction as the layout direction on iOS', () => {
    const { props } = hostOf({ direction: 'rtl' }, 'ios');

    expect(props.layoutDirection).toBe('rtl');
  });

  it('sends the direction as a style entry on Android', () => {
    const { props } = hostOf({ direction: 'rtl' }, 'android');

    expect(props).not.toHaveProperty('layoutDirection');
    expect(props.style).toContainEqual({ direction: 'rtl' });
  });
});

describe('native tabs host platform props', () => {
  it('sends the iOS props only on iOS', () => {
    const ios = {
      tabBarHiddenAnimationEnabled: false,
      tabBarControllerMode: 'tabSidebar',
      tabBarSidebarPreferredPlacement: 'sidebar',
      tabBarMinimizeBehavior: 'onScrollDown',
      tabBarTintColor: 'blue',
      bottomAccessoryHidden: true,
      prominentScreenKey: 'home',
    } as const;

    expect(hostOf({ ios }, 'ios').props).toMatchObject(ios);
    expect(hostOf({ ios }, 'android').props).not.toHaveProperty(
      'tabBarControllerMode',
    );
  });

  it('sends the Android props only on Android', () => {
    const android = { tabBarRespectsIMEInsets: true };

    expect(hostOf({ android }, 'android').props).toMatchObject(android);
    expect(hostOf({ android }, 'ios').props).not.toHaveProperty(
      'tabBarRespectsIMEInsets',
    );
  });
});

describe('native tabs host events', () => {
  it('hands the app a typed tab selected payload', () => {
    const onTabSelected = vi.fn();
    const { props } = hostOf({ onTabSelected });

    handlerOf(
      props,
      'onTabSelected',
    )(
      eventOf({
        selectedScreenKey: 'search',
        provenance: 4,
        isRepeated: true,
        hasTriggeredSpecialEffect: false,
        actionOrigin: 'user',
      }),
    );

    expect(onTabSelected).toHaveBeenCalledWith({
      selectedScreenKey: 'search',
      provenance: 4,
      isRepeated: true,
      hasTriggeredSpecialEffect: false,
      actionOrigin: 'user',
    });
  });

  it('reads an unknown action origin as implicit', () => {
    const onTabSelected = vi.fn();
    const { props } = hostOf({ onTabSelected });

    handlerOf(
      props,
      'onTabSelected',
    )(eventOf({ selectedScreenKey: 'a', actionOrigin: 'weird' }));

    expect(onTabSelected).toHaveBeenCalledWith(
      expect.objectContaining({ actionOrigin: 'implicit' }),
    );
  });

  it('wires a handler only for an event the app listens to', () => {
    const { props } = hostOf({});

    expect(props).not.toHaveProperty('onTabSelected');
    expect(props).not.toHaveProperty('onTabSelectionRejected');
    expect(props).not.toHaveProperty('onTabSelectionPrevented');
  });

  it('hands the app a typed rejection payload', () => {
    const onTabSelectionRejected = vi.fn();
    const { props } = hostOf({ onTabSelectionRejected });

    handlerOf(
      props,
      'onTabSelectionRejected',
    )(
      eventOf({
        selectedScreenKey: 'home',
        provenance: 5,
        rejectedScreenKey: 'search',
        rejectedBaseProvenance: 2,
        rejectionReason: 'stale',
      }),
    );

    expect(onTabSelectionRejected).toHaveBeenCalledWith({
      selectedScreenKey: 'home',
      provenance: 5,
      rejectedScreenKey: 'search',
      rejectedBaseProvenance: 2,
      rejectionReason: 'stale',
    });
  });

  it('hands the app a typed prevented payload', () => {
    const onTabSelectionPrevented = vi.fn();
    const { props } = hostOf({ onTabSelectionPrevented });

    handlerOf(
      props,
      'onTabSelectionPrevented',
    )(
      eventOf({
        selectedScreenKey: 'home',
        provenance: 6,
        preventedScreenKey: 'search',
      }),
    );

    expect(onTabSelectionPrevented).toHaveBeenCalledWith({
      selectedScreenKey: 'home',
      provenance: 6,
      preventedScreenKey: 'search',
    });
  });

  it('sends the more tab event only on iOS', () => {
    const onMoreTabSelected = vi.fn();
    const ios = { onMoreTabSelected };

    const iosHandler = handlerOf(
      hostOf({ ios }, 'ios').props,
      'onMoreTabSelected',
    );
    iosHandler(eventOf({ selectedScreenKey: 'more', provenance: 7 }));

    expect(onMoreTabSelected).toHaveBeenCalledWith({
      selectedScreenKey: 'more',
      provenance: 7,
    });
    expect(hostOf({ ios }, 'android').props).not.toHaveProperty(
      'onMoreTabSelected',
    );
  });
});
