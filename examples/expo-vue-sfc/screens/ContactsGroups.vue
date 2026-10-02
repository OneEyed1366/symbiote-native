<script setup lang="ts">
import { ref } from 'vue';
import { Contact, Container, Group } from '@symbiote-native/contacts/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const props = defineProps<{ contactId: string }>();

const color = lineColorOf(ROUTE_NAME.Contacts);
const REQUIRED = 'Fill the id field first, getAll returns ids to copy';

const groupId = ref('');
const name = ref('Symbiote Group');
const groupContainerId = ref('');
const containerId = ref('');

function required(id: string): string {
  if (id.trim() === '') {
    throw new Error(REQUIRED);
  }
  return id.trim();
}

const group = (): Group => new Group(required(groupId.value));
const container = (): Container => new Container(required(containerId.value));
const scoped = (): string | undefined =>
  groupContainerId.value.trim() === '' ? undefined : groupContainerId.value.trim();

const groupCalls = [
  {
    label: 'Group.create',
    run: async () => {
      const created = await Group.create(name.value, scoped());
      groupId.value = created.id;
      return created.id;
    },
  },
  {
    label: 'Group.getAll',
    run: async () =>
      Promise.all(
        (await Group.getAll(scoped())).map(async item => ({
          id: item.id,
          name: await item.getName(),
        })),
      ),
  },
  { label: 'getName', run: () => group().getName() },
  { label: 'setName', run: () => group().setName(name.value) },
  { label: 'addContact', run: () => group().addContact(new Contact(required(props.contactId))) },
  {
    label: 'removeContact',
    run: () => group().removeContact(new Contact(required(props.contactId))),
  },
  { label: 'getContacts', run: async () => (await group().getContacts()).map(item => item.id) },
  { label: 'delete', run: () => group().delete() },
];

const containerCalls = [
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
        containerId.value = fallback.id;
      }
      return fallback?.id;
    },
  },
  { label: 'getName', run: () => container().getName() },
  { label: 'getType', run: () => container().getType() },
  { label: 'getGroups', run: async () => (await container().getGroups()).map(item => item.id) },
  {
    label: 'getContacts',
    run: async () => (await container().getContacts()).map(item => item.id),
  },
];
</script>

<template>
  <Card testID="contacts-group-card" title="Group (iOS only)">
    <Field
      testID="contacts-group-id-input"
      label="group id"
      :value="groupId"
      :onChange="next => (groupId = next)"
    />
    <Field
      testID="contacts-group-name-input"
      label="group name"
      :value="name"
      :onChange="next => (name = next)"
    />
    <Field
      testID="contacts-group-container-input"
      label="containerId (optional scope)"
      :value="groupContainerId"
      :onChange="next => (groupContainerId = next)"
    />
  </Card>
  <CallConsole
    prefix="contacts-group"
    title="Group calls"
    :color="color"
    hint="Android has no groups, every call rejects with Not implemented there."
    :calls="groupCalls"
  />
  <Card testID="contacts-container-card" title="Container (iOS only)">
    <Field
      testID="contacts-container-id-input"
      label="container id"
      :value="containerId"
      :onChange="next => (containerId = next)"
    />
  </Card>
  <CallConsole
    prefix="contacts-container"
    title="Container calls"
    :color="color"
    :calls="containerCalls"
  />
</template>
