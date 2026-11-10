// aria-кейсы `View-itest` из RN на второй коммит, снятый алиас сбрасывает поле

import {
  committedPayloadOf,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

type IProps = Record<string, unknown>;

// Как перерисовка в React: ключ, которого нет в новом наборе, снимается через `undefined`
function rerender(first: IProps, second: IProps): Record<string, unknown> {
  const surface = createSurface(1);
  const node = createElement('RCTView', false, 'view');
  for (const [name, value] of Object.entries(first))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();

  for (const name of Object.keys(first)) {
    if (!(name in second)) routeProp(node, name, undefined);
  }
  for (const [name, value] of Object.entries(second))
    routeProp(node, name, value);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the view committed no payload');
  return { ...payload };
}

describe('an aria alias removed on a later commit', () => {
  it('resets accessibilityLabel', () => {
    const payload = rerender(
      { 'aria-label': 'custom label', accessible: true },
      { accessible: true },
    );

    expect(payload.accessibilityLabel).toBe(undefined);
  });

  it('resets accessibilityLiveRegion', () => {
    const payload = rerender(
      { 'aria-live': 'polite', accessible: true },
      { accessible: true },
    );

    expect(payload.accessibilityLiveRegion).toBe(undefined);
  });

  const stateAliases = [
    'aria-busy',
    'aria-disabled',
    'aria-expanded',
    'aria-selected',
    'aria-checked',
  ];
  for (const alias of stateAliases) {
    it(`resets accessibilityState after ${alias}`, () => {
      const payload = rerender(
        { [alias]: true, accessible: true },
        { accessible: true },
      );

      expect(payload.accessibilityState).toBe(undefined);
    });
  }
});

describe('an explicit accessibility prop under an alias', () => {
  it('keeps accessibilityLabel when aria-label goes away', () => {
    const payload = rerender(
      {
        'aria-label': 'aria value',
        accessibilityLabel: 'native value',
        accessible: true,
      },
      { accessibilityLabel: 'native value', accessible: true },
    );

    expect(payload.accessibilityLabel).toBe('native value');
  });

  it('keeps importantForAccessibility when aria-hidden goes away', () => {
    const payload = rerender(
      {
        'aria-hidden': true,
        importantForAccessibility: 'no-hide-descendants',
        accessible: true,
      },
      { importantForAccessibility: 'no-hide-descendants', accessible: true },
    );

    expect(payload.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('keeps accessibilityLiveRegion when aria-live goes away', () => {
    const payload = rerender(
      {
        'aria-live': 'polite',
        accessibilityLiveRegion: 'assertive',
        accessible: true,
      },
      { accessibilityLiveRegion: 'assertive', accessible: true },
    );

    expect(payload.accessibilityLiveRegion).toBe('assertive');
  });

  // `aria-hidden={false}` не сбрасывает явное `importantForAccessibility` в auto
  it('keeps importantForAccessibility yes next to aria-hidden false', () => {
    const payload = rerender(
      { importantForAccessibility: 'yes', 'aria-hidden': false },
      { importantForAccessibility: 'yes', 'aria-hidden': false },
    );

    expect(payload.importantForAccessibility).toBe('yes');
  });
});

describe('id and nativeID', () => {
  it('maps id onto nativeID', () => {
    const payload = rerender({ id: 'my-id' }, { id: 'my-id' });

    expect(payload.nativeID).toBe('my-id');
  });

  it('resets nativeID when id is removed', () => {
    const payload = rerender({ id: 'my-id' }, {});

    expect(payload.nativeID).toBe(undefined);
  });

  it('resets nativeID when it is removed', () => {
    const payload = rerender({ nativeID: 'my-id' }, {});

    expect(payload.nativeID).toBe(undefined);
  });
});

report();
