// Web commits the iOS view names, so the DOM host keys its elements off one table
import { describe, expect, it } from 'vitest';
import { COMPONENT_DESCRIPTORS as iosDescriptors } from './index.ios';
import { COMPONENT_DESCRIPTORS, descriptorFor } from './index.web';

describe('component names on web', () => {
  it('resolves every intrinsic to the same descriptor as iOS', () => {
    expect(COMPONENT_DESCRIPTORS).toEqual(iosDescriptors);
  });

  it('commits one scroll view name for both axes', () => {
    expect(descriptorFor('horizontal-scroll-view')).toEqual(
      descriptorFor('scroll-view'),
    );
  });

  it('marks a text intrinsic as text', () => {
    expect(descriptorFor('text')).toEqual({
      component: 'RCTText',
      isText: true,
    });
  });
});
