import { Component, DestroyRef, inject, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  addContactsChangeListener,
  getPermissionsAsync,
  removeAllContactsChangeListeners,
  requestPermissionsAsync,
} from '@symbiote-native/contacts/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

@Component({
  selector: 'ContactsPermissions',
  standalone: true,
  imports: [CallConsole, Card, ResultRow, SYMBIOTE_ELEMENTS, ToggleRow],
  template: `
    <CallConsole
      prefix="contacts-permissions"
      title="Permissions"
      [color]="color"
      [calls]="calls"
    />
    <Card testID="contacts-listener-card" title="Change listener">
      <ToggleRow
        testID="contacts-listener-switch"
        label="addContactsChangeListener / removeAllContactsChangeListeners"
        [value]="isListening()"
        (valueChange)="toggle($event)"
        [color]="color"
      />
      <ResultRow
        testID="contacts-listener-count"
        label="change events"
        [value]="'' + count()"
      />
      <text class="info-text"
        >Edit a contact in the system Contacts app, then come back.</text
      >
    </Card>
  `,
})
export class ContactsPermissions {
  readonly color = lineColorOf(ROUTE_NAME.Contacts);
  readonly count = signal(0);
  readonly isListening = signal(false);

  readonly calls = [
    { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
    { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
  ];

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.isListening()) {
        removeAllContactsChangeListeners();
      }
    });
  }

  toggle(next: boolean): void {
    this.isListening.set(next);
    if (next) {
      addContactsChangeListener(() => this.count.update(value => value + 1));
    } else {
      removeAllContactsChangeListeners();
    }
  }
}
