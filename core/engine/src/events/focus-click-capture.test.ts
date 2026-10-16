// Capture twin (`onFocusCapture`, `onPressCapture`...) of every bubbling event in RN's base
// ViewConfig, т.к. `bubble` already walks `<name>Capture` and only the registration was missing

import { beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
  type ISymbioteNode,
} from '../index';
import { installEventHandler } from './index';

const fabric = installRecordingFabric();
installEventHandler();

function mount(leafComponent = 'RCTView'): {
  root: ISymbioteNode;
  leaf: ISymbioteNode;
} {
  const surface = createSurface(9_994);
  const root = createElement('RCTView');
  const leaf = createElement(leafComponent);
  appendChild(root, leaf);
  surface.appendChild(root);
  surface.commit();
  return { root, leaf };
}

beforeEach(() => fabric.reset());

describe('the capture twins of the bubbling events', () => {
  it('runs onPressCapture on the root before onPress of the target', () => {
    const { root, leaf } = mount();
    const order: string[] = [];
    routeProp(root, 'onPressCapture', () => order.push('root capture'));
    routeProp(leaf, 'onPress', () => order.push('leaf'));
    const touch = {
      identifier: 1,
      pageX: 1,
      pageY: 1,
      locationX: 1,
      locationY: 1,
    };

    fabric.fireEvent(leaf, 'topTouchStart', {
      touches: [touch],
      changedTouches: [touch],
    });
    fabric.fireEvent(leaf, 'topTouchEnd', {
      touches: [],
      changedTouches: [touch],
    });

    expect(order).toEqual(['root capture', 'leaf']);
  });

  it.each([
    ['Focus', 'topFocus', 'RCTView'],
    ['Blur', 'topBlur', 'RCTView'],
    ['Click', 'topClick', 'RCTView'],
    ['Change', 'topChange', 'RCTSinglelineTextInputView'],
    ['SubmitEditing', 'topSubmitEditing', 'RCTSinglelineTextInputView'],
    ['EndEditing', 'topEndEditing', 'RCTSinglelineTextInputView'],
    ['KeyPress', 'topKeyPress', 'RCTSinglelineTextInputView'],
  ])(
    'runs on%sCapture on the root before the target handler',
    (name, raw, leafComponent) => {
      const { root, leaf } = mount(leafComponent);
      const order: string[] = [];
      routeProp(root, `on${name}Capture`, () => order.push('root capture'));
      routeProp(leaf, `on${name}`, () => order.push('leaf'));

      fabric.fireEvent(leaf, raw, {});

      expect(order).toEqual(['root capture', 'leaf']);
    },
  );
});
