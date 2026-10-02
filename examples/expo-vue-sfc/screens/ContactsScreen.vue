<script setup lang="ts">
import { ref } from 'vue';
import { Contact, requestPermissionsAsync } from '@symbiote-native/contacts/vue';
import CallConsole from '../components/CallConsole.vue';
import Explorer from '../components/Explorer.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import ContactsAccessButton from './ContactsAccessButton.vue';
import ContactsGroups from './ContactsGroups.vue';
import ContactsInstance from './ContactsInstance.vue';
import ContactsLegacy from './ContactsLegacy.vue';
import ContactsPermissions from './ContactsPermissions.vue';
import ContactsQueryCard from './ContactsQueryCard.vue';
import ContactsStaticCalls from './ContactsStaticCalls.vue';
import { INITIAL_QUERY, recordFrom } from './contacts-query';
import type { IQuery } from './contacts-query';

const color = lineColorOf(ROUTE_NAME.Contacts);

const query = ref<IQuery>({ ...INITIAL_QUERY });
const contactId = ref('');

function setQuery(patch: Partial<IQuery>): void {
  query.value = { ...query.value, ...patch };
}

function setContactId(id: string): void {
  contactId.value = id;
}

const pickCalls = [
  { label: 'Allow access', run: () => requestPermissionsAsync() },
  {
    label: 'Pick a contact',
    run: async () => {
      const picked = await Contact.presentPicker();
      if (picked) {
        setContactId(picked.id);
      }
      return picked ? await picked.getFullName() : 'nothing picked';
    },
  },
];

const saveCalls = [
  {
    label: 'Open new-contact form',
    run: () => Contact.presentCreateForm(recordFrom('Form', 'Demo')),
  },
];
</script>

<template>
  <ScreenShell
    :route="ROUTE_NAME.Contacts"
    testID="contacts-scroll"
    title="Contacts"
    body="Read and manage the user's address book: pick a contact for a form, save a new one, search, edit, group and listen for changes. Everything asks for permission first."
  >
    <Scenario
      testID="contacts-pick-scenario"
      title="Fill a form from the address book"
      why="Invite a friend or pick a recipient without asking the user to type a name. The system picker shows the address book and returns only the contact the user taps."
      :steps="['Press Allow access and accept', 'Press Pick a contact and tap one']"
      expect="The output shows the full name of the chosen contact. The contact is also remembered for the instance calls in the explorer."
    >
      <CallConsole isBare prefix="contacts-pick" title="Pick a contact" :color="color" :calls="pickCalls" />
    </Scenario>
    <Scenario
      testID="contacts-save-scenario"
      title="Save a new contact from the app"
      why="Let users keep a business card or a support number in their own address book. The system form lets them review and save, so no write permission is needed up front."
      :steps="['Press Open new-contact form', 'Save or cancel in the system form']"
      expect="The form opens prefilled with name, company, phone and email. After Save the contact appears in the system Contacts app."
    >
      <CallConsole isBare prefix="contacts-save" title="New contact form" :color="color" :calls="saveCalls" />
    </Scenario>
    <Explorer testID="contacts-explorer" :color="color">
      <ContactsPermissions />
      <ContactsQueryCard :query="query" :setQuery="setQuery" :color="color" />
      <ContactsStaticCalls :query="query" :color="color" :setContactId="setContactId" />
      <ContactsInstance :contactId="contactId" :setContactId="setContactId" />
      <ContactsGroups :contactId="contactId" />
      <ContactsAccessButton />
      <ContactsLegacy />
    </Explorer>
  </ScreenShell>
</template>
