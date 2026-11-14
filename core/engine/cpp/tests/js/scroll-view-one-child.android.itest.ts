// Android ScrollView hosts exactly one native child, so a flattened content view crashes the mount
// The tree is the hub screen: a scroll view over plain wrapper views and bare texts

import { registerScrollViewBehavior } from '@symbiote-native/components';

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  describe,
  expect,
  it,
  mounted,
  report,
  type IMountedView,
} from './harness';

const ROOT_TAG = 1;

registerScrollViewBehavior();

function textOf(value: string): ISymbioteNode {
  const text = createElement('RCTText', true, 'text');
  appendChild(text, createRawText(value));
  return text;
}

function scrollViewOf(): IMountedView | undefined {
  const surface = createSurface(ROOT_TAG);
  const owner = createElement('RCTScrollView', false, 'scroll-view');
  const wrapper = createElement('RCTView', false, 'view');
  const hero = createElement('RCTView', false, 'view');
  appendChild(hero, textOf('eyebrow'));
  appendChild(hero, textOf('subtitle'));
  appendChild(wrapper, hero);
  appendChild(wrapper, textOf('group title'));
  appendChild(owner, wrapper);
  surface.appendChild(owner);
  surface.commit();
  return mounted().children[0];
}

describe('the scroll view of a screen with plain wrapper views', () => {
  it('holds one native child, the content view', () => {
    const scroll = scrollViewOf();

    expect(scroll?.viewName).toBe('ScrollView');
    expect(scroll?.children.map(child => child.viewName)).toEqual(['View']);
  });
});

report();
