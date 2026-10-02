<script setup lang="ts">
import { Contact } from '@symbiote-native/contacts/vue';
import CallConsole from '../components/CallConsole.vue';
import { DEMO_FIELDS, recordFrom, toQueryOptions } from './contacts-query';
import type { IQuery } from './contacts-query';

const props = defineProps<{
  query: IQuery;
  color: string;
  setContactId: (id: string) => void;
}>();

function remember(contact: Contact | null | undefined): string | undefined {
  if (contact) {
    props.setContactId(contact.id);
  }
  return contact?.id;
}

const calls = [
  {
    label: 'getAll',
    run: async () => {
      const all = await Contact.getAll(toQueryOptions(props.query));
      remember(all[0]);
      return all.map(contact => contact.id);
    },
  },
  {
    label: 'getAllDetails',
    run: () => Contact.getAllDetails(DEMO_FIELDS, toQueryOptions(props.query)),
  },
  { label: 'getCount', run: () => Contact.getCount() },
  { label: 'hasAny', run: () => Contact.hasAny() },
  {
    label: 'create',
    run: async () => remember(await Contact.create(recordFrom('Symbiote', 'Demo'))),
  },
  {
    label: 'presentCreateForm',
    run: () => Contact.presentCreateForm(recordFrom('Form', 'Demo')),
  },
  { label: 'presentPicker', run: async () => remember(await Contact.presentPicker()) },
  {
    label: 'presentAccessPicker',
    run: async () => {
      const picked = await Contact.presentAccessPicker?.();
      remember(picked?.[0]);
      return picked?.map(contact => contact.id);
    },
  },
];
</script>

<template>
  <CallConsole
    prefix="contacts-static"
    title="Contact (static calls)"
    :color="color"
    hint="getAll, create and presentPicker remember the contact id for the instance calls below."
    :calls="calls"
  />
</template>
