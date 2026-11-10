import { describe, expect, it, vi } from 'vitest';
import { StyleSheet } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveTabsBottomAccessory } from './native-tabs-bottom-accessory';

function environmentEvent(payload: Record<string, unknown>): ISymbioteEvent {
  return {
    type: 'environmentChange',
    target: 1,
    currentTarget: 1,
    nativeEvent: payload,
    stopPropagation: () => {},
  };
}

describe('tabs bottom accessory availability', () => {
  it('is absent when the app gave no accessory', () => {
    expect(
      resolveTabsBottomAccessory({
        os: 'ios',
        osVersion: '26.0',
        hasAccessory: false,
      }),
    ).toBeUndefined();
  });

  it('is absent on Android, which has no bottom accessory', () => {
    expect(
      resolveTabsBottomAccessory({
        os: 'android',
        osVersion: 36,
        hasAccessory: true,
      }),
    ).toBeUndefined();
  });

  it('is absent before iOS 26, where native lacks the accessory', () => {
    expect(
      resolveTabsBottomAccessory({
        os: 'ios',
        osVersion: '25.6',
        hasAccessory: true,
      }),
    ).toBeUndefined();
  });

  it.each(['26.0', '26', '27.1'])('is present on iOS %s', osVersion => {
    expect(
      resolveTabsBottomAccessory({ os: 'ios', osVersion, hasAccessory: true }),
    ).toBeDefined();
  });

  it('reads a numeric version too', () => {
    expect(
      resolveTabsBottomAccessory({
        os: 'ios',
        osVersion: 26,
        hasAccessory: true,
      }),
    ).toBeDefined();
  });
});

describe('tabs bottom accessory views', () => {
  const accessory = resolveTabsBottomAccessory({
    os: 'ios',
    osVersion: '26.0',
    hasAccessory: true,
  });

  it('wraps the content in the native accessory view that fills the bar area', () => {
    expect(accessory?.viewName).toBe('RNSTabsBottomAccessory');
    expect(accessory?.props.collapsable).toBe(false);
    expect(accessory?.props.style).toContainEqual(StyleSheet.absoluteFill);
  });

  it('gives one content view for each environment, the regular one first', () => {
    expect(accessory?.contents.map(content => content.environment)).toEqual([
      'regular',
      'inline',
    ]);
  });

  it('tells each content view its environment so native shows the right one', () => {
    for (const content of accessory?.contents ?? []) {
      expect(content.viewName).toBe('RNSTabsBottomAccessoryContent');
      expect(content.props.environment).toBe(content.environment);
      expect(content.props.collapsable).toBe(false);
      expect(content.props.style).toContainEqual(StyleSheet.absoluteFill);
    }
  });

  it('sends no environment event when the app does not listen', () => {
    expect(accessory?.props).not.toHaveProperty('onEnvironmentChange');
  });
});

describe('tabs bottom accessory environment event', () => {
  function wiredHandler(callback: (event: { environment: string }) => void) {
    const accessory = resolveTabsBottomAccessory({
      os: 'ios',
      osVersion: '26.0',
      hasAccessory: true,
      onEnvironmentChange: callback,
    });
    const handler = accessory?.props.onEnvironmentChange;
    if (typeof handler !== 'function')
      throw new Error('no environment handler');
    return handler;
  }

  it('reports the inline environment native sent', () => {
    const callback = vi.fn();

    wiredHandler(callback)(environmentEvent({ environment: 'inline' }));

    expect(callback).toHaveBeenCalledExactlyOnceWith({ environment: 'inline' });
  });

  it('reads an unknown environment as regular, the native default', () => {
    const callback = vi.fn();

    wiredHandler(callback)(environmentEvent({ environment: 'floating' }));

    expect(callback).toHaveBeenCalledExactlyOnceWith({
      environment: 'regular',
    });
  });
});
