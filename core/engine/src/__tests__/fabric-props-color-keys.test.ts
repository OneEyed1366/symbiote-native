// Every style key RN runs through `processColor` reaches the payload as a platform colour
import { describe, expect, it } from 'vitest';
// @ts-expect-error - untyped Flow source
import ReactNativeStyleAttributes from 'react-native/Libraries/Components/View/ReactNativeStyleAttributes';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, setColorProcessor } from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installRecordingFabric();

const PROCESSED = 'processed';

type IStyleAttribute = { process?: unknown } | true | undefined;

const attributes: Record<string, IStyleAttribute> = ReactNativeStyleAttributes;
const COLOR_KEYS = Object.keys(attributes).filter(
  key => key.endsWith('Color') && attributes[key] !== true,
);

describe('payload colours', () => {
  it('has colour keys to check', () => {
    expect(COLOR_KEYS.length).toBeGreaterThan(15);
  });

  it.each(COLOR_KEYS)('converts %s to a platform colour', key => {
    setColorProcessor(() => PROCESSED);
    const node = createElement('RCTView', false, 'view');
    const payload: Record<string, unknown> = fabricProps(node, {
      style: { [key]: 'red' },
    });
    expect(payload[key]).toBe(PROCESSED);
  });
});
