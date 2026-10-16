// `<Text>` inside `<Text>` is a different native view, and this is where that is settled.
//
// The rule is one of the project's load-bearing invariants (root CLAUDE.md, Primitives): a text
// element under a text element commits as `RCTVirtualText` rather than `RCTText`, no adapter
// implements it, and the engine decides it when a node acquires a parent. Until now it was checked
// against a TypeScript tree that had been told the same rule — two statements of one belief, which
// tests neither.
//
// **The rule lives in the SHADOW tree and is invisible on the platform.** A paragraph's contents
// are an attributed string, not views: `RCTVirtualText` and `RCTRawText` are virtual nodes, the
// differ never emits a mutation for them, and a mounted `<Text>` holding a whole sentence is ONE
// view with no children. The first version of this file asserted the nesting against the mounted
// tree and every case came back `Paragraph()`. So text shape is read from `committedShape()`, and
// `mounted()` is used for the claim that only the paragraph itself is a view.
//
// Fabric's own names: `Paragraph` is `RCTText`, `Text` is `RCTVirtualText`, `RawText` is
// `RCTRawText` (`componentNameByReactViewName`).

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  setProp,
} from '@symbiote-native/engine';

import {
  committedShape,
  describe,
  expect,
  it,
  mounted,
  report,
  shapeOf,
} from './harness';

function text(testID: string) {
  const node = createElement('RCTText', true);
  setProp(node, 'testID', testID);
  return node;
}

describe('text nesting decides the native view name', () => {
  // Базовый случай: одинокий текст это абзац с сырым текстом внутри
  it('a lone text element commits as a paragraph holding its characters', () => {
    const surface = createSurface(1);
    const paragraph = text('lead');
    appendChild(paragraph, createRawText('hello'));
    surface.appendChild(paragraph);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(Paragraph(RawText())))');
  });

  // Внутренний элемент тот же компонент, что и внешний, но уходит под другим нативным именем
  it('a text element under a text element commits as virtual text', () => {
    const surface = createSurface(1);
    const outer = text('outer');
    const inner = text('inner');
    appendChild(inner, createRawText('world'));
    appendChild(outer, inner);
    surface.appendChild(outer);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(Paragraph(Text(RawText()))))');
  });

  // `<View>` обрывает текстовый контекст, как `TextAncestorContext` в `View.js` у RN
  // Текст под инлайн-вью остаётся абзацем: виртуальному тексту там негде лежать и он не рисуется
  it('starts a paragraph again below a view in the middle', () => {
    const surface = createSurface(1);
    const outer = text('outer');
    const middle = createElement('RCTView');
    setProp(middle, 'testID', 'middle');
    const inner = text('inner');
    appendChild(inner, createRawText('deep'));
    appendChild(middle, inner);
    appendChild(outer, middle);
    surface.appendChild(outer);
    surface.commit();

    expect(committedShape()).toBe(
      'RootView(View(Paragraph(View(Paragraph(RawText())))))',
    );
  });

  // Вложенность не даёт нативных вью, предложение это один абзац из чего бы оно ни состояло
  it('mounts one view for the paragraph, whatever it contains', () => {
    const surface = createSurface(1);
    const outer = text('outer');
    const inner = text('inner');
    appendChild(inner, createRawText('world'));
    appendChild(outer, inner);
    surface.appendChild(outer);
    surface.commit();

    expect(shapeOf(mounted())).toBe('RootView(Paragraph())');
  });

  // Пустой сырой текст не должен дойти до Fabric, следующий сырой сосед
  // слился бы в пустой вектор и процесс упал бы
  it('skips an empty raw text', () => {
    const surface = createSurface(1);
    const paragraph = text('p');
    appendChild(paragraph, createRawText(''));
    surface.appendChild(paragraph);
    surface.commit();

    expect(committedShape()).toBe('RootView(View(Paragraph()))');
  });
});

report();
