// Порт `SafeAreaView-itest` (Fantom гоняет его на Android), форма смонтированного дерева

import { createElement } from 'react';

import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  expect,
  it,
  mounted,
  report,
  shapeOf,
} from './harness';

describe('<SafeAreaView>', () => {
  beforeEach(() => createRoot(200, 200));

  it('renders with children', () => {
    render(
      createElement(
        'safe-area-view',
        { collapsable: false },
        createElement('text', null, 'Hello World!'),
      ),
    );

    // Fantom ждёт здесь обычный `View`: RN на Android падает обратно на него. Мы монтируем
    // `RCTSafeAreaView` с отступами окна, это решение пользователя
    expect(mounted().children.map(shapeOf).join('')).toBe(
      'SafeAreaView(Paragraph())',
    );
  });
});

report();
