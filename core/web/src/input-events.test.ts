// @vitest-environment happy-dom
// Поле ввода в странице говорит с приложением теми же событиями и командами, что и на устройстве

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  treeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootWebHost, type IWebBoot } from './boot';

const SINGLE_LINE = 'RCTSinglelineTextInputView';
const MULTI_LINE = 'RCTMultilineTextInputView';
const NOOP = (): void => {};

describe('text input in the page', () => {
  let container: HTMLElement;
  let boot: IWebBoot;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    boot = bootWebHost({ document, container });
  });

  afterEach(() => {
    boot.dispose();
    disposeRoot(boot.rootTag);
    container.remove();
  });

  function mount(
    viewName: string,
    props: Record<string, unknown>,
  ): ISymbioteNode {
    const surface = createSurface(boot.rootTag);
    const node = createElement(viewName);
    for (const [name, value] of Object.entries(props)) {
      routeProp(node, name, value);
    }
    surface.appendChild(node);
    surface.commit();
    // The engine registered its own dispatcher with the surface, the spy takes its place
    globalThis.nativeFabricUIManager?.registerEventHandler((...args) =>
      calls.push(args),
    );
    return node;
  }

  function field(): HTMLInputElement | HTMLTextAreaElement {
    const element = container.firstElementChild?.firstElementChild;
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      throw new Error('no field');
    }
    return element;
  }

  function type(text: string): void {
    const element = field();
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  describe('value', () => {
    it('starts with the text prop', () => {
      mount(SINGLE_LINE, { text: 'hello' });

      expect(field().value).toBe('hello');
    });

    it('starts with defaultValue when no text came', () => {
      mount(SINGLE_LINE, { defaultValue: 'seed' });

      expect(field().value).toBe('seed');
    });
  });

  describe('change', () => {
    it('sends the new text with a growing event count', () => {
      const node = mount(SINGLE_LINE, { onChange: NOOP });

      type('a');
      type('ab');

      expect(calls).toEqual([
        [node, 'topChange', { text: 'a', eventCount: 1 }],
        [node, 'topChange', { text: 'ab', eventCount: 2 }],
      ]);
    });

    it('counts a change nobody listens to, so the acknowledged count stays honest', () => {
      const node = mount(SINGLE_LINE, {});
      const host = treeHost();

      type('a');
      host?.dispatchCommand(node, 'setTextAndSelection', [0, 'z', -1, -1]);

      expect(field().value).toBe('a');
    });
  });

  describe('setTextAndSelection', () => {
    it('writes the text of a write that saw the latest change', () => {
      const node = mount(SINGLE_LINE, { onChange: NOOP });
      type('a');

      treeHost()?.dispatchCommand(node, 'setTextAndSelection', [1, 'A', 1, 1]);

      expect(field().value).toBe('A');
      expect(field().selectionStart).toBe(1);
    });

    it('cuts a written text to maxLength, which the browser does not do for a script', () => {
      const node = mount(SINGLE_LINE, { maxLength: 3 });

      treeHost()?.dispatchCommand(node, 'setTextAndSelection', [
        0,
        'abcdef',
        -1,
        -1,
      ]);

      expect(field().value).toBe('abc');
    });

    it('drops a write older than the latest change', () => {
      const node = mount(SINGLE_LINE, { onChange: NOOP });
      type('a');
      type('ab');

      treeHost()?.dispatchCommand(node, 'setTextAndSelection', [
        1,
        'A',
        -1,
        -1,
      ]);

      expect(field().value).toBe('ab');
    });

    it('moves the selection without touching the text', () => {
      const node = mount(SINGLE_LINE, { text: 'hello' });

      treeHost()?.dispatchCommand(node, 'setTextAndSelection', [
        0,
        'hello',
        1,
        3,
      ]);

      expect([field().selectionStart, field().selectionEnd]).toEqual([1, 3]);
    });

    it('keeps the text while the user composes', () => {
      const node = mount(SINGLE_LINE, { onChange: NOOP });
      field().dispatchEvent(new Event('compositionstart', { bubbles: true }));
      type('こ');

      treeHost()?.dispatchCommand(node, 'setTextAndSelection', [
        1,
        'x',
        -1,
        -1,
      ]);
      field().dispatchEvent(new Event('compositionend', { bubbles: true }));
      treeHost()?.dispatchCommand(node, 'setTextAndSelection', [
        1,
        'x',
        -1,
        -1,
      ]);

      expect(field().value).toBe('x');
    });
  });

  describe('focus', () => {
    it('sends focus, then end of editing and blur with the text', () => {
      const node = mount(SINGLE_LINE, {
        text: 'hi',
        onFocus: NOOP,
        onBlur: NOOP,
        onEndEditing: NOOP,
      });

      field().dispatchEvent(new Event('focusin', { bubbles: true }));
      field().dispatchEvent(new Event('focusout', { bubbles: true }));

      expect(calls).toEqual([
        [node, 'topFocus', { text: 'hi' }],
        [node, 'topEndEditing', { text: 'hi' }],
        [node, 'topBlur', { text: 'hi' }],
      ]);
    });

    it('selects the whole text on focus for selectTextOnFocus', () => {
      mount(SINGLE_LINE, { text: 'hello', selectTextOnFocus: true });

      field().focus();

      expect([field().selectionStart, field().selectionEnd]).toEqual([0, 5]);
    });

    it('clears the text on focus for clearTextOnFocus and tells the app', () => {
      const node = mount(SINGLE_LINE, {
        text: 'hello',
        clearTextOnFocus: true,
        onChange: NOOP,
      });

      field().focus();

      expect(field().value).toBe('');
      expect(calls).toEqual([[node, 'topChange', { text: '', eventCount: 1 }]]);
    });

    it('leaves the text alone on focus by default', () => {
      mount(SINGLE_LINE, { text: 'hello' });

      field().focus();

      expect(field().value).toBe('hello');
    });
  });

  describe('keys', () => {
    function press(key: string): void {
      field().dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
    }

    it('sends the key of a character, Enter, Backspace and Tab', () => {
      const node = mount(SINGLE_LINE, { onKeyPress: NOOP });

      press('a');
      press('Enter');
      press('Backspace');
      press('Shift');

      expect(calls).toEqual([
        [node, 'topKeyPress', { key: 'a' }],
        [node, 'topKeyPress', { key: 'Enter' }],
        [node, 'topKeyPress', { key: 'Backspace' }],
      ]);
    });

    it('submits a single line field on Enter', () => {
      const node = mount(SINGLE_LINE, { text: 'go', onSubmitEditing: NOOP });

      press('Enter');

      expect(calls).toEqual([[node, 'topSubmitEditing', { text: 'go' }]]);
    });

    it('blurs a single line field on Enter by default', () => {
      mount(SINGLE_LINE, { text: 'go' });
      field().focus();

      press('Enter');

      expect(document.activeElement).not.toBe(field());
    });

    it('keeps the focus when blurOnSubmit is false', () => {
      mount(SINGLE_LINE, { text: 'go', blurOnSubmit: false });
      field().focus();

      press('Enter');

      expect(document.activeElement).toBe(field());
    });

    it('keeps the focus for submitBehavior submit', () => {
      mount(SINGLE_LINE, { text: 'go', submitBehavior: 'submit' });
      field().focus();

      press('Enter');

      expect(document.activeElement).toBe(field());
    });

    it('lets a multiline field take Enter as a new line', () => {
      mount(MULTI_LINE, { text: 'go', onSubmitEditing: NOOP });

      press('Enter');

      expect(calls).toEqual([]);
    });
  });

  describe('content size', () => {
    const contentIs = (width: number, height: number): void => {
      Object.defineProperty(field(), 'scrollWidth', {
        value: width,
        configurable: true,
      });
      Object.defineProperty(field(), 'scrollHeight', {
        value: height,
        configurable: true,
      });
    };

    it('reports the size of a multiline field when its content changes it', () => {
      const node = mount(MULTI_LINE, { onContentSizeChange: NOOP });
      contentIs(200, 60);

      type('a\nb');

      expect(calls).toEqual([
        [
          node,
          'topContentSizeChange',
          { contentSize: { width: 200, height: 60 } },
        ],
      ]);
    });

    it('stays quiet while the size is the same', () => {
      mount(MULTI_LINE, { onContentSizeChange: NOOP });
      contentIs(200, 60);

      type('a');
      type('ab');

      expect(calls).toHaveLength(1);
    });

    it('is not asked of a single line field', () => {
      mount(SINGLE_LINE, { onContentSizeChange: NOOP });
      contentIs(200, 20);

      type('a');

      expect(calls).toEqual([]);
    });
  });

  describe('selection', () => {
    it('sends the caret range when it moves in the focused field', () => {
      const node = mount(SINGLE_LINE, {
        text: 'hello',
        onSelectionChange: NOOP,
      });
      field().focus();

      field().setSelectionRange(1, 3);
      document.dispatchEvent(new Event('selectionchange'));
      document.dispatchEvent(new Event('selectionchange'));

      expect(calls).toEqual([
        [node, 'topSelectionChange', { selection: { start: 1, end: 3 } }],
      ]);
    });
  });
});
