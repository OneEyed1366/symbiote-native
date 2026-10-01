import { Component, input, model } from '@angular/core';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { SORT_CHOICES } from './contacts-query';
import type { IQuery } from './contacts-query';

@Component({
  selector: 'ContactsQueryCard',
  standalone: true,
  imports: [Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="contacts-query-card" title="Query options">
      <Field
        testID="contacts-limit-input"
        label="limit"
        [value]="query().limit"
        (valueChange)="patch({ limit: $event })"
      />
      <Field
        testID="contacts-offset-input"
        label="offset"
        [value]="query().offset"
        (valueChange)="patch({ offset: $event })"
      />
      <Field
        testID="contacts-name-input"
        label="name filter"
        [value]="query().name"
        (valueChange)="patch({ name: $event })"
      />
      <ChoiceRow
        testID="contacts-sort"
        label="sortOrder"
        [options]="sortChoices"
        [value]="query().sortOrder"
        (valueChange)="patch({ sortOrder: $event })"
        [color]="color()"
      />
      <ToggleRow
        testID="contacts-raw-switch"
        label="rawContacts (iOS)"
        [value]="query().rawContacts"
        (valueChange)="patch({ rawContacts: $event })"
        [color]="color()"
      />
    </Card>
  `,
})
export class ContactsQueryCard {
  readonly query = model.required<IQuery>();
  readonly color = input.required<string>();

  readonly sortChoices = SORT_CHOICES;

  patch(change: Partial<IQuery>): void {
    this.query.update(current => ({ ...current, ...change }));
  }
}
