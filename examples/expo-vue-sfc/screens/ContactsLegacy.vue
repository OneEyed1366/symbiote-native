<script setup lang="ts">
import { reactive } from 'vue';
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
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Contacts);
const QUERY_FIELDS = [Fields.Name, Fields.PhoneNumbers, Fields.Emails];

type IIds = { contactId: string; groupId: string; containerId: string };

const ids = reactive<IIds>({ contactId: '', groupId: '', containerId: '' });

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

const contact = (): string => need(ids.contactId, 'contact id');
const group = (): string => need(ids.groupId, 'group id');
const container = (): string => need(ids.containerId, 'container id');

const contactCalls = [
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
      ids.contactId = page.data[0]?.id ?? ids.contactId;
      return page;
    },
  },
  {
    label: 'getPagedContactsAsync',
    run: () => getPagedContactsAsync({ pageSize: 3, pageOffset: 0 }),
  },
  { label: 'getContactByIdAsync', run: () => getContactByIdAsync(contact(), QUERY_FIELDS) },
  {
    label: 'addContactAsync',
    run: async () => {
      const id = await addContactAsync(
        {
          contactType: ContactTypes.Person,
          name: 'Legacy Demo',
          firstName: 'Legacy',
          lastName: 'Demo',
        },
        ids.containerId.trim() === '' ? undefined : ids.containerId.trim(),
      );
      ids.contactId = id;
      return id;
    },
  },
  {
    label: 'updateContactAsync',
    run: () => updateContactAsync({ id: contact(), note: 'updated by the canary' }),
  },
  { label: 'removeContactAsync', run: () => removeContactAsync(contact()) },
  { label: 'presentFormAsync', run: () => presentFormAsync(contact()) },
  {
    label: 'presentContactPickerAsync',
    run: async () => {
      const picked = await presentContactPickerAsync();
      ids.contactId = picked?.id ?? ids.contactId;
      return picked;
    },
  },
  { label: 'presentAccessPickerAsync', run: () => presentAccessPickerAsync() },
  { label: 'writeContactToFileAsync', run: () => writeContactToFileAsync({ id: contact() }) },
  {
    label: 'shareContactAsync',
    run: () => shareContactAsync(contact(), 'Shared from the canary'),
  },
];

const groupCalls = [
  {
    label: 'getDefaultContainerIdAsync',
    run: async () => {
      const id = await getDefaultContainerIdAsync();
      ids.containerId = id;
      return id;
    },
  },
  { label: 'getContainersAsync', run: () => getContainersAsync({}) },
  {
    label: 'createGroupAsync',
    run: async () => {
      const id = await createGroupAsync('Legacy Group');
      ids.groupId = id;
      return id;
    },
  },
  { label: 'getGroupsAsync', run: () => getGroupsAsync({}) },
  {
    label: 'updateGroupNameAsync',
    run: () => updateGroupNameAsync('Renamed Legacy Group', group()),
  },
  { label: 'removeGroupAsync', run: () => removeGroupAsync(group()) },
  {
    label: 'addExistingContactToGroupAsync',
    run: () => addExistingContactToGroupAsync(contact(), group()),
  },
  {
    label: 'removeContactFromGroupAsync',
    run: () => removeContactFromGroupAsync(contact(), group()),
  },
  {
    label: 'addExistingGroupToContainerAsync',
    run: () => addExistingGroupToContainerAsync(group(), container()),
  },
];

const permissionCalls = [
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
</script>

<template>
  <Card testID="contacts-legacy-ids-card" title="Legacy ids">
    <Field
      testID="contacts-legacy-contact-input"
      label="contact id"
      :value="ids.contactId"
      :onChange="contactId => (ids.contactId = contactId)"
    />
    <Field
      testID="contacts-legacy-group-input"
      label="group id"
      :value="ids.groupId"
      :onChange="groupId => (ids.groupId = groupId)"
    />
    <Field
      testID="contacts-legacy-container-input"
      label="container id"
      :value="ids.containerId"
      :onChange="containerId => (ids.containerId = containerId)"
    />
  </Card>
  <CallConsole
    prefix="contacts-legacy-contacts"
    title="Legacy contacts"
    :color="color"
    :calls="contactCalls"
  />
  <CallConsole
    prefix="contacts-legacy-groups"
    title="Legacy groups and containers"
    :color="color"
    :calls="groupCalls"
  />
  <CallConsole
    prefix="contacts-legacy-permissions"
    title="Legacy permissions and listener"
    :color="color"
    :calls="permissionCalls"
  />
</template>
