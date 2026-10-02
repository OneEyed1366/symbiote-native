import { Component, input, model } from '@angular/core';
import { Contact } from '@symbiote-native/contacts/angular';
import { CallConsole } from '../components/CallConsole';
import { DEMO_FIELDS, recordFrom, toQueryOptions } from './contacts-query';
import type { IQuery } from './contacts-query';

@Component({
  selector: 'ContactsStaticCalls',
  standalone: true,
  imports: [CallConsole],
  template: `
    <CallConsole
      prefix="contacts-static"
      title="Contact (static calls)"
      [color]="color()"
      hint="getAll, create and presentPicker remember the contact id for the instance calls below."
      [calls]="calls"
    />
  `,
})
export class ContactsStaticCalls {
  readonly query = input.required<IQuery>();
  readonly color = input.required<string>();
  readonly contactId = model.required<string>();

  private remember(contact: Contact | null | undefined): string | undefined {
    if (contact) {
      this.contactId.set(contact.id);
    }
    return contact?.id;
  }

  readonly calls = [
    {
      label: 'getAll',
      run: async () => {
        const all = await Contact.getAll(toQueryOptions(this.query()));
        this.remember(all[0]);
        return all.map(contact => contact.id);
      },
    },
    {
      label: 'getAllDetails',
      run: () =>
        Contact.getAllDetails(DEMO_FIELDS, toQueryOptions(this.query())),
    },
    { label: 'getCount', run: () => Contact.getCount() },
    { label: 'hasAny', run: () => Contact.hasAny() },
    {
      label: 'create',
      run: async () =>
        this.remember(await Contact.create(recordFrom('Symbiote', 'Demo'))),
    },
    {
      label: 'presentCreateForm',
      run: () => Contact.presentCreateForm(recordFrom('Form', 'Demo')),
    },
    {
      label: 'presentPicker',
      run: async () => this.remember(await Contact.presentPicker()),
    },
    {
      label: 'presentAccessPicker',
      run: async () => {
        const picked = await Contact.presentAccessPicker?.();
        this.remember(picked?.[0]);
        return picked?.map(contact => contact.id);
      },
    },
  ];
}
