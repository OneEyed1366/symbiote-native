// RN applies a style preprocessor to the native payload, not just to `flatten`
import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  StyleSheet,
  createElement,
  propOf,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installRecordingFabric();

const VIEW = 'RCTView';

function payloadOf(node: ISymbioteNode): Record<string, unknown> {
  return fabricProps(node, { style: propOf(node, 'style') });
}

describe('a registered style preprocessor on the committed payload', () => {
  StyleSheet.setStyleAttributePreprocessor('elevation', value =>
    typeof value === 'number' ? value * 2 : value,
  );

  it('rewrites the key of an authored style', () => {
    const node = createElement(VIEW);
    routeProp(node, 'style', { elevation: 4, flex: 1 });

    expect(payloadOf(node)).toMatchObject({ elevation: 8, flex: 1 });
  });

  it('rewrites the key of a style that came from a class', () => {
    registerRules([
      {
        tokens: ['doubled'],
        specificity: [0, 1, 0],
        order: 0,
        style: { elevation: 3 },
      },
    ]);
    const node = createElement(VIEW);
    routeProp(node, 'className', 'doubled');

    expect(payloadOf(node)).toMatchObject({ elevation: 6 });
  });

  it('leaves a style without the key alone', () => {
    const node = createElement(VIEW);
    routeProp(node, 'style', { flex: 1 });

    expect(payloadOf(node)).toMatchObject({ flex: 1 });
  });
});
