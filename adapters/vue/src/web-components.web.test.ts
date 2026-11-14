// @vitest-environment happy-dom
// The real components, not intrinsic elements, run on a page and hear a person's gestures

import './register';
import { disposeCanary, mountOnWeb } from '@symbiote-native/web/canary';
import {
  clickElement,
  elementByTestId,
  scrollElementTo,
  tapElement,
  textLeaf,
  typeInto,
} from '@symbiote-native/web/interactions';
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './components/modal';
import { AppRegistry } from './modules/app-registry';

describe('Vue components on the web', () => {
  afterEach(disposeCanary);

  it('calls onPress of a Pressable that was tapped', async () => {
    const onPress = vi.fn();
    const page = await mountOnWeb(
      AppRegistry,
      () => () => h('pressable', { testID: 'go', onPress }, [h('text', 'go')]),
    );

    await tapElement(elementByTestId(page, 'go'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap on a disabled Pressable', async () => {
    const onPress = vi.fn();
    const page = await mountOnWeb(
      AppRegistry,
      () => () =>
        h('pressable', { testID: 'go', disabled: true, onPress }, [
          h('text', 'go'),
        ]),
    );

    await tapElement(elementByTestId(page, 'go'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('hands the typed text of a TextInput to onChangeText', async () => {
    const onChangeText = vi.fn();
    const page = await mountOnWeb(
      AppRegistry,
      () => () => h('text-input', { testID: 'field', onChangeText }),
    );

    await typeInto(page, 'hi');

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText.mock.calls[0]?.[0].text).toBe('hi');
  });

  it('shows a Button as its blue title and presses it', async () => {
    const onPress = vi.fn();
    const page = await mountOnWeb(
      AppRegistry,
      () => () => h('button', { testID: 'save', title: 'Save', onPress }),
    );
    const button = elementByTestId(page, 'save');

    await tapElement(button);

    expect(textLeaf(button, 'Save').style.color).toBe('#007AFF');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('turns a Switch on when the app takes the value it reports', async () => {
    const isOn = ref(false);
    const Screen = defineComponent({
      setup: () => () =>
        h('switch', {
          testID: 'sw',
          value: isOn.value,
          onValueChange: (event: { value: boolean }) => {
            isOn.value = event.value;
          },
        }),
    });
    const page = await mountOnWeb(AppRegistry, () => Screen);
    const control = elementByTestId(page, 'sw');

    await clickElement(control);

    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('covers the page with a visible Modal and asks to close it on Escape', async () => {
    const onRequestClose = vi.fn();
    const page = await mountOnWeb(
      AppRegistry,
      () => () =>
        h('view', null, [
          h(
            Modal,
            { visible: true, testID: 'dlg', onRequestClose },
            { default: () => h('text', 'inside') },
          ),
        ]),
    );
    const dialog = elementByTestId(page, 'dlg');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect([
      dialog.getAttribute('role'),
      dialog.style.position,
      dialog.textContent,
      onRequestClose.mock.calls.length,
    ]).toEqual(['dialog', 'fixed', 'inside', 1]);
  });

  it('paints no Modal that is not visible', async () => {
    const page = await mountOnWeb(
      AppRegistry,
      () => () =>
        h(
          Modal,
          { visible: false, testID: 'dlg' },
          { default: () => h('text', 'inside') },
        ),
    );

    expect(page.querySelector('[data-testid="dlg"]')).toBeNull();
  });

  it('shows an ActivityIndicator as a turning ring', async () => {
    const page = await mountOnWeb(
      AppRegistry,
      () => () => h('activity-indicator', { testID: 'spin', size: 'large' }),
    );

    const ring = elementByTestId(page, 'spin');

    expect([ring.getAttribute('role'), ring.style.width]).toEqual([
      'progressbar',
      '36px',
    ]);
  });

  it('reports the offset of a ScrollView that scrolled to onScroll', async () => {
    const onScroll = vi.fn();
    const page = await mountOnWeb(
      AppRegistry,
      () => () =>
        h('scroll-view', { testID: 'list', onScroll }, [h('text', 'row')]),
    );

    await scrollElementTo(elementByTestId(page, 'list'), 30);

    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll.mock.calls[0]?.[0].nativeEvent.contentOffset).toEqual({
      x: 0,
      y: 30,
    });
  });
});
