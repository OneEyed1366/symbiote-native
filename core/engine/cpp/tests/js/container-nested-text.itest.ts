// A text under a text commits as virtual text, which has no layout of its own
// The commit hook waits for a consumer's layout, so a nested consumer never hears its container

import {
  appendChild,
  clearGlobalStyles,
  committedPayloadOf,
  createElement,
  createRawText,
  createSurface,
  registerRules,
  routeProp,
  setNativeDebug,
  takeNativeDebugLog,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const PLAIN_PADDING = 4;
const HELD_PADDING = 16;
const WIDE = 500;
const NO_LAYOUT = 'container consumer has no layout: ';

function mountConsumerText(isNested: boolean): ISymbioteNode {
  clearGlobalStyles();
  registerRules(
    [
      { tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: PLAIN_PADDING } },
      { tokens: ['card'], specificity: [0, 1, 0], order: 1, style: { padding: HELD_PADDING }, cond: 0 },
    ],
    [['@', null, ['>=', 'width', 400]]],
  );
  const container = createElement('RCTView', false);
  routeProp(container, 'style', { containerType: 'size', width: WIDE, height: 80 });
  const consumer = createElement('RCTText', true);
  routeProp(consumer, 'class', 'card');
  appendChild(consumer, createRawText('text'));
  if (isNested) {
    const outer = createElement('RCTText', true);
    appendChild(outer, consumer);
    appendChild(container, outer);
  } else {
    appendChild(container, consumer);
  }
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(container);
  surface.commit();
  mounted();
  return consumer;
}

describe('a text that answers to a container', () => {
  it('is restyled when it sits directly in the container', () => {
    setNativeDebug(true);
    takeNativeDebugLog();
    const consumer = mountConsumerText(false);
    const log = takeNativeDebugLog();
    setNativeDebug(false);

    expect(committedPayloadOf(consumer)?.padding).toBe(HELD_PADDING);
    expect(log.some(line => line.includes(NO_LAYOUT))).toBe(false);
  });

  // [характеризация - поведение не подтверждено]
  // ВОПРОС: should a nested text hear its container? Today it stays on the plain style
  it('[характеризация - поведение не подтверждено] stays plain when nested under a text', () => {
    setNativeDebug(true);
    takeNativeDebugLog();
    const consumer = mountConsumerText(true);
    const log = takeNativeDebugLog();
    setNativeDebug(false);

    expect(committedPayloadOf(consumer)?.padding).toBe(PLAIN_PADDING);
    expect(log.some(line => line.includes(`${NO_LAYOUT}Text`))).toBe(true);
  });
});

report();
