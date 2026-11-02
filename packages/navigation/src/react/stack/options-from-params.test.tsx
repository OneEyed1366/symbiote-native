// Demo screens derive options from `route.params` through `setParams`, there is no `setOptions`
// This file pins that loop: the options resolver runs again after a param change

// Imported from `./index`, not the package barrel, so `../register` never loads headless

// No Negative group: the resolver is app code, a throwing one is the app's own bug

import { act, createElement, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { childrenOf } from '@symbiote-native/engine';
import type { ISymbioteNode } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import type { IScreenOptionsResolver } from '../screen';

const ROOT_TAG = 513;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {},
    validAttributes: { screenId: true, activityState: true },
  },
  [STACK_VIEW]: { directEventTypes: {}, validAttributes: {} },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: {},
    validAttributes: { title: true, hidden: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function stackRootHandle(): ISymbioteNode {
  const stack = fabric.find(node => node.viewName === STACK_VIEW);
  if (stack === undefined) throw new Error('no screen stack created');
  return stack.handle;
}

// Walks the live child links, a recording keeps every node it ever saw created
function liveNodes(handle: ISymbioteNode = stackRootHandle()): IAuthoredNode[] {
  const found: IAuthoredNode[] = [];
  for (const child of childrenOf(handle)) {
    const recorded = fabric.find(one => one.handle === child);
    if (recorded !== undefined) found.push(recorded);
    found.push(...liveNodes(child));
  }
  return found;
}

function headerTitles(): unknown[] {
  return liveNodes()
    .filter(node => node.viewName === HEADER_CONFIG_VIEW)
    .map(node => node.props.title);
}

function titleOf(params: unknown): string {
  if (typeof params === 'object' && params !== null && 'title' in params) {
    return String(params.title);
  }
  return 'no title';
}

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('text', {}, 'home');
}

const titleFromParams: IScreenOptionsResolver = ({ route }) => ({
  title: titleOf(route.params),
});

describe('screen options derived from route params', () => {
  describe('Positive', () => {
    it('re-runs the options resolver with the new params after setParams', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: titleFromParams,
            initialParams: { title: 'first' },
          }),
        ),
      );
      expect(headerTitles()).toEqual(['first']);
      act(() => ref.current?.setParams({ title: 'second' }));
      expect(headerTitles()).toEqual(['second']);
    });

    it('gives each route in the stack its own params-derived header', () => {
      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, {
            name: 'Home',
            component: HomeScreen,
            options: titleFromParams,
            initialParams: { title: 'home' },
          }),
          createElement(Stack.Screen, {
            name: 'Details',
            component: HomeScreen,
            options: titleFromParams,
          }),
        ),
      );
      act(() => ref.current?.push('Details', { title: 'details' }));
      act(() => ref.current?.setParams({ title: 'details v2' }));
      expect(headerTitles()).toEqual(['home', 'details v2']);
    });
  });
});
