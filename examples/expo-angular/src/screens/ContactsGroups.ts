import { Component, input, signal } from '@angular/core';
import { Contact, Container, Group } from '@symbiote-native/contacts/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const REQUIRED = 'Fill the id field first, getAll returns ids to copy';

function required(id: string): string {
  if (id.trim() === '') {
    throw new Error(REQUIRED);
  }
  return id.trim();
}

@Component({
  selector: 'ContactsGroups',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="contacts-group-card" title="Group (iOS only)">
      <Field
        testID="contacts-group-id-input"
        label="group id"
        [(value)]="groupId"
      />
      <Field
        testID="contacts-group-name-input"
        label="group name"
        [(value)]="name"
      />
      <Field
        testID="contacts-group-container-input"
        label="containerId (optional scope)"
        [(value)]="groupContainerId"
      />
    </Card>
    <CallConsole
      prefix="contacts-group"
      title="Group calls"
      [color]="color"
      hint="Android has no groups, every call rejects with Not implemented there."
      [calls]="groupCalls"
    />
    <Card testID="contacts-container-card" title="Container (iOS only)">
      <Field
        testID="contacts-container-id-input"
        label="container id"
        [(value)]="containerId"
      />
    </Card>
    <CallConsole
      prefix="contacts-container"
      title="Container calls"
      [color]="color"
      [calls]="containerCalls"
    />
  `,
})
export class ContactsGroups {
  readonly contactId = input.required<string>();

  readonly color = lineColorOf(ROUTE_NAME.Contacts);

  readonly groupId = signal('');
  readonly name = signal('Symbiote Group');
  readonly groupContainerId = signal('');
  readonly containerId = signal('');

  private group(): Group {
    return new Group(required(this.groupId()));
  }

  private container(): Container {
    return new Container(required(this.containerId()));
  }

  private scoped(): string | undefined {
    const scope = this.groupContainerId().trim();
    return scope === '' ? undefined : scope;
  }

  private member(): Contact {
    return new Contact(required(this.contactId()));
  }

  readonly groupCalls: ICall[] = [
    {
      label: 'Group.create',
      run: async () => {
        const created = await Group.create(this.name(), this.scoped());
        this.groupId.set(created.id);
        return created.id;
      },
    },
    {
      label: 'Group.getAll',
      run: async () =>
        Promise.all(
          (await Group.getAll(this.scoped())).map(async item => ({
            id: item.id,
            name: await item.getName(),
          })),
        ),
    },
    { label: 'getName', run: () => this.group().getName() },
    { label: 'setName', run: () => this.group().setName(this.name()) },
    { label: 'addContact', run: () => this.group().addContact(this.member()) },
    {
      label: 'removeContact',
      run: () => this.group().removeContact(this.member()),
    },
    {
      label: 'getContacts',
      run: async () => (await this.group().getContacts()).map(item => item.id),
    },
    { label: 'delete', run: () => this.group().delete() },
  ];

  readonly containerCalls: ICall[] = [
    {
      label: 'Container.getAll',
      run: async () =>
        Promise.all(
          (await Container.getAll()).map(async item => ({
            id: item.id,
            name: await item.getName(),
            type: await item.getType(),
          })),
        ),
    },
    {
      label: 'Container.getDefault',
      run: async () => {
        const fallback = await Container.getDefault();
        if (fallback) {
          this.containerId.set(fallback.id);
        }
        return fallback?.id;
      },
    },
    { label: 'getName', run: () => this.container().getName() },
    { label: 'getType', run: () => this.container().getType() },
    {
      label: 'getGroups',
      run: async () =>
        (await this.container().getGroups()).map(item => item.id),
    },
    {
      label: 'getContacts',
      run: async () =>
        (await this.container().getContacts()).map(item => item.id),
    },
  ];
}
