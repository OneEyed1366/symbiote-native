// @vitest-environment happy-dom
// The real components, not intrinsic elements, run on a page and hear a person's gestures

import './register';
import {
  appListenerFor,
  hasListenerFor,
  isSymbioteNode,
  treeHost,
} from '@symbiote-native/engine';
import { disposeCanary, mountOnWeb } from '@symbiote-native/web/canary';
import { useState, type ReactElement } from 'react';
import {
  clickElement,
  elementByTestId,
  scrollElementTo,
  settle,
  tapElement,
  textLeaf,
  typeInto,
} from '@symbiote-native/web/interactions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './components/modal';
import { AppRegistry } from './modules/app-registry';

describe('React components on the web', () => {
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

  it('tints a pressed TouchableHighlight and dims its child', async () => {
    const page = await mountOnWeb(AppRegistry, () => () => (
      <touchable-highlight testID="box" underlayColor="gold" onPress={vi.fn()}>
        <view testID="inner" />
      </touchable-highlight>
    ));
    const box = elementByTestId(page, 'box');
    box.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
      }),
    );
    await settle();

    expect(box.style.backgroundColor).toBe('gold');
    expect(elementByTestId(page, 'inner').style.opacity).toBe('0.85');
  });

  it('moves a Switch only when the app takes the value it reports', async () => {
    const seen: boolean[] = [];
    function Screen(): ReactElement {
      const [isOn, setOn] = useState(false);
      return (
        <switch
          testID="sw"
          value={isOn}
          onValueChange={event => {
            seen.push(event.value);
            if (seen.length > 1) setOn(event.value);
          }}
        />
      );
    }
    const page = await mountOnWeb(AppRegistry, () => Screen);
    const control = elementByTestId(page, 'sw');

    await clickElement(control);
    const afterRefusal = control.getAttribute('aria-checked');
    await clickElement(control);

    expect([seen, afterRefusal, control.getAttribute('aria-checked')]).toEqual([
      [true, true],
      'false',
      'true',
    ]);
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
    const list = elementByTestId(page, 'list');
    const host = treeHost();
    const handle =
      host && 'handleAt' in host && typeof host.handleAt === 'function'
        ? host.handleAt(list)
        : undefined;

    expect([
      isSymbioteNode(handle),
      isSymbioteNode(handle) && typeof appListenerFor(handle, 'scroll'),
      isSymbioteNode(handle) && hasListenerFor(handle, 'scroll'),
    ]).toEqual([true, 'function', true]);

    await scrollElementTo(list, 30);

    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScroll.mock.calls[0]?.[0].nativeEvent.contentOffset).toEqual({
      x: 0,
      y: 30,
    });
  });
});
