import { Component, computed, signal } from '@angular/core';
import { ContactAccessButton } from '@symbiote-native/contacts/angular';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const CAPTIONS = [
  { label: 'default', value: 'default' },
  { label: 'email', value: 'email' },
  { label: 'phone', value: 'phone' },
] as const;

const BUTTON_STYLE = { height: 52 };

function split(text: string): string[] {
  return text
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

@Component({
  selector: 'ContactsAccessButton',
  standalone: true,
  imports: [Card, ChoiceRow, ContactAccessButton, Field, ResultRow],
  template: `
    <Card testID="contacts-access-card" title="ContactAccessButton (iOS 18+)">
      <ResultRow
        testID="contacts-access-available"
        label="isAvailable"
        [value]="isAvailable"
      />
      <Field
        testID="contacts-access-query-input"
        label="query"
        [(value)]="query"
      />
      <ChoiceRow
        testID="contacts-access-caption"
        label="caption"
        [options]="captions"
        [(value)]="caption"
        [color]="color"
      />
      <Field
        testID="contacts-access-emails-input"
        label="ignoredEmails (comma separated)"
        [(value)]="ignoredEmails"
      />
      <Field
        testID="contacts-access-phones-input"
        label="ignoredPhoneNumbers (comma separated)"
        [(value)]="ignoredPhones"
      />
      <ContactAccessButton
        testID="contacts-access-button"
        [query]="query()"
        [caption]="caption()"
        [ignoredEmails]="emails()"
        [ignoredPhoneNumbers]="phones()"
        [tintColor]="color"
        backgroundColor="#ffffff"
        textColor="#0b1622"
        [style]="buttonStyle"
      />
    </Card>
  `,
})
export class ContactsAccessButton {
  readonly color = lineColorOf(ROUTE_NAME.Contacts);
  readonly captions = CAPTIONS;
  readonly buttonStyle = BUTTON_STYLE;
  readonly isAvailable = String(ContactAccessButton.isAvailable());

  readonly query = signal('');
  readonly caption = signal<(typeof CAPTIONS)[number]['value']>('default');
  readonly ignoredEmails = signal('');
  readonly ignoredPhones = signal('');

  readonly emails = computed(() => split(this.ignoredEmails()));
  readonly phones = computed(() => split(this.ignoredPhones()));
}
