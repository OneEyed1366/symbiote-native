import { Component, computed, model, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  Contact,
  NonGregorianCalendar,
} from '@symbiote-native/contacts/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import {
  ACCESSORS,
  FIELD_CHOICES,
  MISSING,
  collectionGroups,
} from './contacts-instance-calls';
import { recordFrom } from './contacts-query';

@Component({
  selector: 'ContactsInstance',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, SYMBIOTE_ELEMENTS],
  template: `
    <Card testID="contacts-selected-card" title="Selected contact">
      <Field
        testID="contacts-id-input"
        label="contact id"
        [(value)]="contactId"
        placeholder="set by create / getAll / presentPicker"
      />
    </Card>
    <CallConsole
      prefix="contacts-instance"
      title="Contact (instance calls)"
      [color]="color"
      [calls]="instanceCalls"
    />
    <Card testID="contacts-accessor-card" title="Field accessors">
      <ChoiceRow
        testID="contacts-accessor-field"
        label="field (get<Field> / set<Field>)"
        [options]="fieldChoices"
        [(value)]="field"
        [color]="color"
      />
      <Field
        testID="contacts-accessor-value-input"
        label="value for set"
        [(value)]="value"
      />
    </Card>
    <CallConsole
      prefix="contacts-accessor"
      title="Selected field"
      [color]="color"
      [calls]="accessorCalls"
    />
    @if (id() === '') {
      <text class="info-text">{{ missing }}</text>
    } @else {
      @for (calls of groups(); track $index) {
        <CallConsole
          [prefix]="'contacts-collection-' + $index"
          [title]="calls[0].label.replace('add', '')"
          [color]="color"
          [calls]="calls"
        />
      }
    }
  `,
})
export class ContactsInstance {
  readonly contactId = model.required<string>();

  readonly color = lineColorOf(ROUTE_NAME.Contacts);
  readonly missing = MISSING;
  readonly fieldChoices = FIELD_CHOICES;

  readonly field = signal('givenName');
  readonly value = signal('Renamed');

  readonly id = computed(() => this.contactId().trim());
  readonly groups = computed<ICall[][]>(() =>
    this.id() === '' ? [] : collectionGroups(new Contact(this.id())),
  );

  private contactFor(): Contact {
    if (this.id() === '') {
      throw new Error(MISSING);
    }
    return new Contact(this.id());
  }

  readonly instanceCalls: ICall[] = [
    { label: 'getFullName', run: () => this.contactFor().getFullName() },
    { label: 'getThumbnail', run: () => this.contactFor().getThumbnail() },
    {
      label: 'getIsFavourite',
      run: async () => this.contactFor().getIsFavourite?.(),
    },
    {
      label: 'setIsFavourite',
      run: async () => this.contactFor().setIsFavourite?.(true),
    },
    {
      label: 'getBirthday',
      run: async () => this.contactFor().getBirthday?.(),
    },
    {
      label: 'setBirthday',
      run: async () =>
        this.contactFor().setBirthday?.({ year: 1990, month: 5, day: 17 }),
    },
    {
      label: 'getNonGregorianBirthday',
      run: async () => this.contactFor().getNonGregorianBirthday?.(),
    },
    {
      label: 'setNonGregorianBirthday',
      run: async () =>
        this.contactFor().setNonGregorianBirthday?.({
          calendar: NonGregorianCalendar.hebrew,
          month: 1,
          day: 1,
        }),
    },
    {
      label: 'patch',
      run: () => this.contactFor().patch({ note: 'patched by the canary' }),
    },
    {
      label: 'update',
      run: () => this.contactFor().update(recordFrom('Updated', 'Demo')),
    },
    {
      label: 'editWithForm',
      run: () =>
        this.contactFor().editWithForm({
          allowsEditing: true,
          message: 'Symbiote',
        }),
    },
    { label: 'delete', run: () => this.contactFor().delete() },
  ];

  readonly accessorCalls: ICall[] = [
    { label: 'get', run: () => ACCESSORS[this.field()].get(this.contactFor()) },
    {
      label: 'set',
      run: () => ACCESSORS[this.field()].set(this.contactFor(), this.value()),
    },
  ];
}
