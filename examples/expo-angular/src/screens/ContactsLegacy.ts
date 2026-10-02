import { Component, signal } from '@angular/core';
import {
  ContactTypes,
  Fields,
  SortTypes,
  addContactAsync,
  addContactsChangeListener,
  addExistingContactToGroupAsync,
  addExistingGroupToContainerAsync,
  createGroupAsync,
  getContactByIdAsync,
  getContactsAsync,
  getContainersAsync,
  getDefaultContainerIdAsync,
  getGroupsAsync,
  getPagedContactsAsync,
  getPermissionsAsync,
  hasContactsAsync,
  isAvailableAsync,
  presentAccessPickerAsync,
  presentContactPickerAsync,
  presentFormAsync,
  removeContactAsync,
  removeContactFromGroupAsync,
  removeGroupAsync,
  requestPermissionsAsync,
  shareContactAsync,
  updateContactAsync,
  updateGroupNameAsync,
  writeContactToFileAsync,
} from '@symbiote-native/contacts/legacy';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const QUERY_FIELDS = [Fields.Name, Fields.PhoneNumbers, Fields.Emails];

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

@Component({
  selector: 'ContactsLegacy',
  standalone: true,
  imports: [CallConsole, Card, Field],
  template: `
    <Card testID="contacts-legacy-ids-card" title="Legacy ids">
      <Field
        testID="contacts-legacy-contact-input"
        label="contact id"
        [(value)]="contactId"
      />
      <Field
        testID="contacts-legacy-group-input"
        label="group id"
        [(value)]="groupId"
      />
      <Field
        testID="contacts-legacy-container-input"
        label="container id"
        [(value)]="containerId"
      />
    </Card>
    <CallConsole
      prefix="contacts-legacy-contacts"
      title="Legacy contacts"
      [color]="color"
      [calls]="contactCalls"
    />
    <CallConsole
      prefix="contacts-legacy-groups"
      title="Legacy groups and containers"
      [color]="color"
      [calls]="groupCalls"
    />
    <CallConsole
      prefix="contacts-legacy-permissions"
      title="Legacy permissions and listener"
      [color]="color"
      [calls]="permissionCalls"
    />
  `,
})
export class ContactsLegacy {
  readonly color = lineColorOf(ROUTE_NAME.Contacts);

  readonly contactId = signal('');
  readonly groupId = signal('');
  readonly containerId = signal('');

  private contact(): string {
    return need(this.contactId(), 'contact id');
  }

  private group(): string {
    return need(this.groupId(), 'group id');
  }

  private container(): string {
    return need(this.containerId(), 'container id');
  }

  readonly contactCalls: ICall[] = [
    { label: 'isAvailableAsync', run: () => isAvailableAsync() },
    { label: 'hasContactsAsync', run: () => hasContactsAsync() },
    {
      label: 'getContactsAsync',
      run: async () => {
        const page = await getContactsAsync({
          pageSize: 10,
          fields: QUERY_FIELDS,
          sort: SortTypes.FirstName,
        });
        this.contactId.set(page.data[0]?.id ?? this.contactId());
        return page;
      },
    },
    {
      label: 'getPagedContactsAsync',
      run: () => getPagedContactsAsync({ pageSize: 3, pageOffset: 0 }),
    },
    {
      label: 'getContactByIdAsync',
      run: () => getContactByIdAsync(this.contact(), QUERY_FIELDS),
    },
    {
      label: 'addContactAsync',
      run: async () => {
        const scope = this.containerId().trim();
        const id = await addContactAsync(
          {
            contactType: ContactTypes.Person,
            name: 'Legacy Demo',
            firstName: 'Legacy',
            lastName: 'Demo',
          },
          scope === '' ? undefined : scope,
        );
        this.contactId.set(id);
        return id;
      },
    },
    {
      label: 'updateContactAsync',
      run: () =>
        updateContactAsync({
          id: this.contact(),
          note: 'updated by the canary',
        }),
    },
    {
      label: 'removeContactAsync',
      run: () => removeContactAsync(this.contact()),
    },
    { label: 'presentFormAsync', run: () => presentFormAsync(this.contact()) },
    {
      label: 'presentContactPickerAsync',
      run: async () => {
        const picked = await presentContactPickerAsync();
        this.contactId.set(picked?.id ?? this.contactId());
        return picked;
      },
    },
    {
      label: 'presentAccessPickerAsync',
      run: () => presentAccessPickerAsync(),
    },
    {
      label: 'writeContactToFileAsync',
      run: () => writeContactToFileAsync({ id: this.contact() }),
    },
    {
      label: 'shareContactAsync',
      run: () => shareContactAsync(this.contact(), 'Shared from the canary'),
    },
  ];

  readonly groupCalls: ICall[] = [
    {
      label: 'getDefaultContainerIdAsync',
      run: async () => {
        const id = await getDefaultContainerIdAsync();
        this.containerId.set(id);
        return id;
      },
    },
    { label: 'getContainersAsync', run: () => getContainersAsync({}) },
    {
      label: 'createGroupAsync',
      run: async () => {
        const id = await createGroupAsync('Legacy Group');
        this.groupId.set(id);
        return id;
      },
    },
    { label: 'getGroupsAsync', run: () => getGroupsAsync({}) },
    {
      label: 'updateGroupNameAsync',
      run: () => updateGroupNameAsync('Renamed Legacy Group', this.group()),
    },
    { label: 'removeGroupAsync', run: () => removeGroupAsync(this.group()) },
    {
      label: 'addExistingContactToGroupAsync',
      run: () => addExistingContactToGroupAsync(this.contact(), this.group()),
    },
    {
      label: 'removeContactFromGroupAsync',
      run: () => removeContactFromGroupAsync(this.contact(), this.group()),
    },
    {
      label: 'addExistingGroupToContainerAsync',
      run: () =>
        addExistingGroupToContainerAsync(this.group(), this.container()),
    },
  ];

  readonly permissionCalls: ICall[] = [
    { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
    { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
    {
      label: 'addContactsChangeListener',
      run: async () => {
        const subscription = addContactsChangeListener(() => undefined);
        subscription.remove();
        return 'subscribed and removed';
      },
    },
  ];
}
