// Наборы `Text-itest`: accessibility, `role` и `testID` со смонтированного абзаца
// Остальные prop-кейсы в `text-fabric-props.itest.ts`, `ref` не портируем (DOM API)
// Только Android, на iOS абзац доступен по умолчанию (`Text.js:145`)

import { createElement } from 'react';

import {
  accessibilityPropsSuite,
  rolePropSuite,
  testIDPropSuite,
} from './accessibility-props-suite';
import { createRoot, render } from './culling-fixture';
import { describe, expect, it, mounted, report } from './harness';

const TEST_TEXT = 'the text';

function readText(props: Record<string, unknown>): Record<string, unknown> {
  render(createElement('text', props, TEST_TEXT));
  const [paragraph] = mounted().children;
  return { ...paragraph?.props };
}

describe('<Text> mounted element', () => {
  it('is a paragraph, its characters live in the attributed string', () => {
    createRoot(200, 200);
    render(createElement('text', null, TEST_TEXT));

    const [paragraph] = mounted().children;
    expect(paragraph?.viewName).toBe('Paragraph');
    expect(paragraph?.children.length).toBe(0);
  });
});

accessibilityPropsSuite(readText, false);
rolePropSuite(readText);
testIDPropSuite(readText);

report();
