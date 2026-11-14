// @vitest-environment happy-dom
// The real components, not intrinsic elements, run on a page and hear a person's gestures

import './register';
import { disposeCanary, mountOnWeb } from '@symbiote-native/web/canary';
import { createSignal } from 'solid-js';
import {
  clickElement,
  elementByTestId,
  scrollElementTo,
  tapElement,
  textLeaf,
  typeInto,
} from '@symbiote-native/web/interactions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './components/modal';
import { AppRegistry } from './modules/app-registry';

describe('Solid components on the web', () => {
  afterEach(disposeCanary);

  it('calls onPress of a Pressable that was tapped', async () => {
    const onPress = vi.fn();
    const page = await mountOnWeb(AppRegistry, () => () => (
      <pressable testID="go" onPress={onPress}>
        <text>go</text>
      </pressable>
    ));

    await tapElement(elementByTestId(page, 'go'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap on a disabled Pressable', async () => {
    const onPress = vi.fn();
    const page = await mountOnWeb(AppRegistry, () => () => (
      <pressable testID="go" disabled onPress={onPress}>
        <text>go</text>
      </pressable>
    ));

    await tapElement(elementByTestId(page, 'go'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('hands the typed text of a TextInput to onChangeText', async () => {
    const onChangeText = vi.fn();
    const page = await mountOnWeb(AppRegistry, () => () => (
      <text-input testID="field" onChangeText={onChangeText} />
    ));

    await typeInto(page, 'hi');

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText.mock.calls[0]?.[0].text).toBe('hi');
  });

  it('shows a Button as its blue title and presses it', async () => {
    const onPress = vi.fn();
    const page = await mountOnWeb(AppRegistry, () => () => (
      <button testID="save" title="Save" onPress={onPress} />
    ));
    const button = elementByTestId(page, 'save');

    await tapElement(button);

    expect(textLeaf(button, 'Save').style.color).toBe('#007AFF');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('turns a Switch on when the app takes the value it reports', async () => {
    const Screen = () => {
      const [isOn, setOn] = createSignal(false);
      return (
        <switch
          testID="sw"
          value={isOn()}
          onValueChange={(event: { value: boolean }) => setOn(event.value)}
        />
      );
    };
    const page = await mountOnWeb(AppRegistry, () => Screen);
    const control = elementByTestId(page, 'sw');

    await clickElement(control);

    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('covers the page with a visible Modal and asks to close it on Escape', async () => {
    const onRequestClose = vi.fn();
    const page = await mountOnWeb(AppRegistry, () => () => (
      <view>
        <Modal visible testID="dlg" onRequestClose={onRequestClose}>
          <text>inside</text>
        </Modal>
      </view>
    ));
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
    const page = await mountOnWeb(AppRegistry, () => () => (
      <Modal visible={false} testID="dlg">
        <text>inside</text>
      </Modal>
    ));

    expect(page.querySelector('[data-testid="dlg"]')).toBeNull();
  });

  it('shows an ActivityIndicator as a turning ring', async () => {
    const page = await mountOnWeb(AppRegistry, () => () => (
      <activity-indicator testID="spin" size="large" />
    ));

    const ring = elementByTestId(page, 'spin');

    expect([ring.getAttribute('role'), ring.style.width]).toEqual([
      'progressbar',
      '36px',
    ]);
  });

  it('reports the offset of a ScrollView that scrolled to onScroll', async () => {
    const onScroll = vi.fn();
    const page = await mountOnWeb(AppRegistry, () => () => (
      <scroll-view testID="list" onScroll={onScroll}>
        <text>row</text>
      </scroll-view>
    ));

    await scrollElementTo(elementByTestId(page, 'list'), 30);

    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll.mock.calls[0]?.[0].nativeEvent.contentOffset).toEqual({
      x: 0,
      y: 30,
    });
  });
});
