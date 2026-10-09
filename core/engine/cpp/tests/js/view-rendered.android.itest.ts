// @symbiote-platform-extensions

// Порт `View-itest` (Fantom гоняет его на Android): transform, `pointerEvents`, accessibility и id
// Размеры, margin, `transformOrigin` и `aspectRatio` в `view-style-parity.itest.ts`
// Не портируем `ref` с `ReactNativeElement` и тегом `RN:View` (DOM API)

// Первым: градиент разбирает `processBackgroundImage` из RN, ему нужен его `processColor`
import './stock-renderer';

import { createElement, Fragment } from 'react';

import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  expect,
  it,
  mounted,
  report,
  type IMountedView,
} from './harness';

type IProps = Record<string, unknown>;

// Свёрнутый Fabric-ом вью не доходит до монтирования, как `null` у `getRenderedOutput`
function viewOf(props: IProps): IMountedView | undefined {
  render(createElement('view', props));
  return mounted().children[0];
}

function propOf(props: IProps, name: string): unknown {
  return viewOf(props)?.props[name];
}

const ABSENT = undefined;
const IDLE_STATE = {
  disabled: 'false',
  selected: 'false',
  checked: 'None',
  busy: 'false',
  expanded: 'null',
};

function stateString(patch: Partial<typeof IDLE_STATE>): string {
  const { disabled, selected, checked, busy, expanded } = {
    ...IDLE_STATE,
    ...patch,
  };
  return `{disabled:${disabled},selected:${selected},checked:${checked},busy:${busy},expanded:${expanded}}`;
}

describe('<View> style', () => {
  beforeEach(() => createRoot(200, 200));

  it('transform causes the view to be unflattened', () => {
    expect(
      propOf({ style: { transform: [{ translateX: 10 }] } }, 'transform'),
    ).toBe('[{"translateX": 10}]');
  });

  it('pointerEvents box-none does not unflatten the view', () => {
    expect(
      propOf(
        { collapsable: false, pointerEvents: 'box-none' },
        'pointerEvents',
      ),
    ).toBe('box-none');
    expect(viewOf({ pointerEvents: 'box-none' })).toBe(undefined);
  });

  it('background-image parses CSS and object syntax', () => {
    const expected =
      '[radial-gradient(ellipse farthest-corner at 50% 50% , rgba(230, 100, 101, 1), rgba(145, 152, 229, 1))]';
    render(
      createElement(
        Fragment,
        null,
        createElement('view', {
          style: {
            experimental_backgroundImage: 'radial-gradient(#e66465, #9198e5)',
          },
        }),
        createElement('view', {
          style: {
            experimental_backgroundImage: [
              {
                type: 'radial-gradient',
                shape: 'ellipse',
                position: { top: '50%', right: '50%' },
                size: 'farthest-corner',
                colorStops: [{ color: '#e66465' }, { color: '#9198e5' }],
              },
            ],
          },
        }),
      ),
    );

    const images = mounted().children.map(child => child.props.backgroundImage);
    expect(images).toEqual([expected, expected]);
  });
});

describe('<View> accessibility', () => {
  beforeEach(() => createRoot(200, 200));

  it('accessibilityActions are propagated to the mounting layer', () => {
    expect(
      propOf(
        {
          accessibilityActions: [
            { name: 'activate' },
            { name: 'increment', label: 'random label' },
          ],
          accessible: true,
        },
        'accessibilityActions',
      ),
    ).toBe("[activate, increment: 'random label']");
  });

  it('accessibilityActions alone do not unflatten the view', () => {
    expect(viewOf({ accessibilityActions: [{ name: 'activate' }] })).toBe(
      undefined,
    );
  });

  // RN filters it out by the Android ViewConfig, we send every prop and the Android view manager
  // has no setter for it, so it changes nothing on screen
  it('accessibilityElementsHidden still reaches the payload on Android', () => {
    const view = viewOf({
      accessibilityElementsHidden: true,
      collapsable: false,
    });

    expect(view?.props.accessibilityElementsHidden).toBe('true');
  });

  for (const [name, value] of [
    ['accessibilityHint', 'exit'],
    ['accessibilityLabel', 'custom label'],
    ['accessibilityLiveRegion', 'polite'],
    ['accessibilityRole', 'button'],
  ] as const) {
    it(`${name} is propagated to the mounting layer`, () => {
      expect(propOf({ [name]: value, accessible: true }, name)).toBe(value);
    });

    it(`${name} alone does not unflatten the view`, () => {
      expect(viewOf({ [name]: value })).toBe(undefined);
    });
  }

  it('aria-hidden is mapped to importantForAccessibility and resets', () => {
    expect(
      propOf(
        { 'aria-hidden': true, collapsable: false },
        'importantForAccessibility',
      ),
    ).toBe('no-hide-descendants');
    expect(propOf({ collapsable: false }, 'importantForAccessibility')).toBe(
      ABSENT,
    );
  });

  it('aria-hidden removed keeps an explicit importantForAccessibility', () => {
    const explicit = {
      importantForAccessibility: 'no-hide-descendants',
      accessible: true,
    };

    expect(
      propOf({ 'aria-hidden': true, ...explicit }, 'importantForAccessibility'),
    ).toBe('no-hide-descendants');
    expect(propOf(explicit, 'importantForAccessibility')).toBe(
      'no-hide-descendants',
    );
  });

  it('aria-hidden false does not overwrite an explicit importantForAccessibility', () => {
    expect(
      propOf(
        {
          importantForAccessibility: 'yes',
          'aria-hidden': false,
          collapsable: false,
        },
        'importantForAccessibility',
      ),
    ).toBe('yes');
  });

  it('aria-label is mapped to accessibilityLabel and resets', () => {
    expect(
      propOf(
        { 'aria-label': 'custom label', accessible: true },
        'accessibilityLabel',
      ),
    ).toBe('custom label');
    expect(propOf({ accessible: true }, 'accessibilityLabel')).toBe(ABSENT);
  });

  it('aria-label wins over accessibilityLabel and gives way when removed', () => {
    const both = {
      'aria-label': 'aria value',
      accessibilityLabel: 'native value',
      accessible: true,
    };

    expect(propOf(both, 'accessibilityLabel')).toBe('aria value');
    expect(
      propOf(
        { accessibilityLabel: 'native value', accessible: true },
        'accessibilityLabel',
      ),
    ).toBe('native value');
  });

  it('aria-live is mapped to accessibilityLiveRegion and resets', () => {
    expect(
      propOf(
        { 'aria-live': 'polite', accessible: true },
        'accessibilityLiveRegion',
      ),
    ).toBe('polite');
    expect(propOf({ accessible: true }, 'accessibilityLiveRegion')).toBe(
      ABSENT,
    );
  });

  it('aria-live removed keeps an explicit accessibilityLiveRegion', () => {
    expect(
      propOf(
        {
          'aria-live': 'polite',
          accessibilityLiveRegion: 'assertive',
          accessible: true,
        },
        'accessibilityLiveRegion',
      ),
    ).toBe('polite');
    expect(
      propOf(
        { accessibilityLiveRegion: 'assertive', accessible: true },
        'accessibilityLiveRegion',
      ),
    ).toBe('assertive');
  });

  for (const [alias, patch] of [
    ['aria-busy', { busy: 'true' }],
    ['aria-disabled', { disabled: 'true' }],
    ['aria-expanded', { expanded: 'true' }],
    ['aria-selected', { selected: 'true' }],
    ['aria-checked', { checked: 'Checked' }],
  ] as const) {
    it(`${alias} is mapped to accessibilityState and resets`, () => {
      expect(
        propOf({ [alias]: true, accessible: true }, 'accessibilityState'),
      ).toBe(stateString(patch));
      expect(propOf({ accessible: true }, 'accessibilityState')).toBe(ABSENT);
    });
  }

  it('accessible unflattens the view', () => {
    expect(viewOf({})).toBe(undefined);
    expect(propOf({ accessible: true }, 'accessible')).toBe('true');
  });
});

describe('<View> web compat props', () => {
  beforeEach(() => createRoot(200, 200));

  it('id is mapped to nativeID and resets', () => {
    expect(propOf({ id: 'my-id', collapsable: false }, 'nativeID')).toBe(
      'my-id',
    );
    expect(propOf({ collapsable: false }, 'nativeID')).toBe(ABSENT);
  });

  it('nativeID resets when removed', () => {
    expect(propOf({ nativeID: 'my-id', collapsable: false }, 'nativeID')).toBe(
      'my-id',
    );
    expect(propOf({ collapsable: false }, 'nativeID')).toBe(ABSENT);
  });
});

report();
