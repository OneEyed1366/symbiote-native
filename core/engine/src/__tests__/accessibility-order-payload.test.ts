// RN's `experimental_accessibilityOrder` is a plain native prop: the order reaches Fabric untouched

import { describe, expect, it } from 'vitest';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
import { createElement, createSurface, routeProp } from '../index';

installRecordingFabric();

describe('experimental_accessibilityOrder', () => {
  it('commits the list of nativeIDs as written', () => {
    const surface = createSurface(9_991);
    const view = createElement('RCTView');
    routeProp(view, 'experimental_accessibilityOrder', ['title', 'price']);
    surface.appendChild(view);
    surface.commit();

    expect(payloadOf(view).experimental_accessibilityOrder).toEqual([
      'title',
      'price',
    ]);
  });
});
