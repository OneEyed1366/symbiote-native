<script lang="ts">
  import { Contact } from '@symbiote-native/contacts/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import { DEMO_FIELDS, recordFrom, toQueryOptions } from './contacts-query';
  import type { IQuery } from './contacts-query';

  let {
    query,
    color,
    setContactId,
  }: { query: IQuery; color: string; setContactId: (id: string) => void } = $props();

  function remember(contact: Contact | null | undefined): string | undefined {
    if (contact) {
      setContactId(contact.id);
    }
    return contact?.id;
  }
</script>

<CallConsole
  prefix="contacts-static"
  title="Contact (static calls)"
  {color}
  hint="getAll, create and presentPicker remember the contact id for the instance calls below."
  calls={[
    {
      label: 'getAll',
      run: async () => {
        const all = await Contact.getAll(toQueryOptions(query));
        remember(all[0]);
        return all.map(contact => contact.id);
      },
    },
    {
      label: 'getAllDetails',
      run: () => Contact.getAllDetails(DEMO_FIELDS, toQueryOptions(query)),
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
  ]}
/>
