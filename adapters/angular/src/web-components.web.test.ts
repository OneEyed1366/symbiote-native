// @vitest-environment happy-dom
// The real components, not intrinsic elements, run on a page and hear a person's gestures

import '@angular/compiler';
import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { disposeCanary, mountOnWeb } from '@symbiote-native/web/canary';
import {
  clickElement,
  elementByTestId,
  scrollElementTo,
  tapElement,
  textLeaf,
  typeInto,
} from '@symbiote-native/web/interactions';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './components/modal';
import { SYMBIOTE_ELEMENTS } from './elements';
import { AppRegistry } from './modules/app-registry';
import './register';

// What the template handlers record, read back by each test
const calls: unknown[] = [];

@Component({
  selector: 'press-app',
  template: `<pressable testID="go" (press)="record('press')"
    ><text>go</text></pressable
  >`,
  schemas: [NO_ERRORS_SCHEMA],
})
class PressApp {
  record(call: unknown): void {
    calls.push(call);
  }
}

@Component({
  selector: 'disabled-press-app',
  template: `<pressable testID="go" [disabled]="true" (press)="record('press')"
    ><text>go</text></pressable
  >`,
  schemas: [NO_ERRORS_SCHEMA],
})
class DisabledPressApp {
  record(call: unknown): void {
    calls.push(call);
  }
}

@Component({
  selector: 'field-app',
  template: `<text-input
    testID="field"
    (change)="record($event.nativeEvent.text)"
  ></text-input>`,
  schemas: [NO_ERRORS_SCHEMA],
})
class FieldApp {
  record(call: unknown): void {
    calls.push(call);
  }
}

@Component({
  selector: 'list-app',
  template: `<scroll-view
    testID="list"
    (scroll)="record($event.nativeEvent.contentOffset)"
    ><text>row</text></scroll-view
  >`,
  schemas: [NO_ERRORS_SCHEMA],
})
class ListApp {
  record(call: unknown): void {
    calls.push(call);
  }
}

@Component({
  selector: 'save-app',
  template: `<button
    testID="save"
    title="Save"
    (press)="record('press')"
  ></button>`,
  schemas: [NO_ERRORS_SCHEMA],
})
class SaveApp {
  record(call: unknown): void {
    calls.push(call);
  }
}

@Component({
  selector: 'toggle-app',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<switch testID="sw" [value]="isOn" [onValueChange]="take"></switch>
    <activity-indicator testID="spin" size="large"></activity-indicator>`,
})
class ToggleApp {
  isOn = false;

  take = (event: { value: boolean }): void => {
    this.isOn = event.value;
  };
}

@Component({
  selector: 'dialog-app',
  standalone: true,
  imports: [Modal],
  template: `<Modal
    [visible]="true"
    [testID]="'dlg'"
    (requestClose)="record('close')"
  >
    <text>inside</text>
  </Modal>`,
})
class DialogApp {
  record(call: unknown): void {
    calls.push(call);
  }
}

@Component({
  selector: 'hidden-dialog-app',
  standalone: true,
  imports: [Modal],
  template: `<Modal [visible]="false" [testID]="'dlg'"
    ><text>inside</text></Modal
  >`,
})
class HiddenDialogApp {}

describe('Angular components on the web', () => {
  afterEach(() => {
    disposeCanary();
    calls.length = 0;
  });

  it('calls the press handler of a Pressable that was tapped', async () => {
    const page = await mountOnWeb(AppRegistry, () => PressApp);

    await tapElement(elementByTestId(page, 'go'));

    expect(calls).toEqual(['press']);
  });

  it('ignores a tap on a disabled Pressable', async () => {
    const page = await mountOnWeb(AppRegistry, () => DisabledPressApp);

    await tapElement(elementByTestId(page, 'go'));

    expect(calls).toEqual([]);
  });

  it('hands the typed text of a TextInput to change', async () => {
    const page = await mountOnWeb(AppRegistry, () => FieldApp);

    await typeInto(page, 'hi');

    expect(calls).toEqual(['hi']);
  });

  it('shows a Button as its blue title and presses it', async () => {
    const page = await mountOnWeb(AppRegistry, () => SaveApp);
    const button = elementByTestId(page, 'save');

    await tapElement(button);

    expect(textLeaf(button, 'Save').style.color).toBe('#007AFF');
    expect(calls).toEqual(['press']);
  });

  it('turns a Switch on when the app takes the value it reports', async () => {
    const page = await mountOnWeb(AppRegistry, () => ToggleApp);
    const control = elementByTestId(page, 'sw');

    await clickElement(control);

    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('covers the page with a visible Modal and asks to close it on Escape', async () => {
    const page = await mountOnWeb(AppRegistry, () => DialogApp);
    const dialog = elementByTestId(page, 'dlg');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect([
      dialog.getAttribute('role'),
      dialog.style.position,
      dialog.textContent?.trim(),
      calls,
    ]).toEqual(['dialog', 'fixed', 'inside', ['close']]);
  });

  it('paints no Modal that is not visible', async () => {
    const page = await mountOnWeb(AppRegistry, () => HiddenDialogApp);

    expect(page.querySelector('[data-testid="dlg"]')).toBeNull();
  });

  it('shows an ActivityIndicator as a turning ring', async () => {
    const page = await mountOnWeb(AppRegistry, () => ToggleApp);

    const ring = elementByTestId(page, 'spin');

    expect([ring.getAttribute('role'), ring.style.width]).toEqual([
      'progressbar',
      '36px',
    ]);
  });

  it('reports the offset of a ScrollView that scrolled to scroll', async () => {
    const page = await mountOnWeb(AppRegistry, () => ListApp);

    await scrollElementTo(elementByTestId(page, 'list'), 30);

    expect(calls).toEqual([{ x: 0, y: 30 }]);
  });
});
