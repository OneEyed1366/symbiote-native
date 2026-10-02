<script lang="ts">
  import { Contact, NonGregorianCalendar } from '@symbiote-native/contacts/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { ACCESSORS, FIELD_CHOICES, MISSING, collectionGroups } from './contacts-instance-calls';
  import { recordFrom } from './contacts-query';

  let { contactId, setContactId }: { contactId: string; setContactId: (id: string) => void } =
    $props();

  const color = lineColorOf(ROUTE_NAME.Contacts);

  let field = $state('givenName');
  let value = $state('Renamed');

  const id = $derived(contactId.trim());
  const groups = $derived(id === '' ? [] : collectionGroups(new Contact(id)));

  function contactFor(): Contact {
    if (id === '') {
      throw new Error(MISSING);
    }
    return new Contact(id);
  }
</script>

<Card testID="contacts-selected-card" title="Selected contact">
  <Field
    testID="contacts-id-input"
    label="contact id"
    value={contactId}
    onChange={setContactId}
    placeholder="set by create / getAll / presentPicker"
  />
</Card>
<CallConsole
  prefix="contacts-instance"
  title="Contact (instance calls)"
  {color}
  calls={[
    { label: 'getFullName', run: () => contactFor().getFullName() },
    { label: 'getThumbnail', run: () => contactFor().getThumbnail() },
    { label: 'getIsFavourite', run: async () => contactFor().getIsFavourite?.() },
    { label: 'setIsFavourite', run: async () => contactFor().setIsFavourite?.(true) },
    { label: 'getBirthday', run: async () => contactFor().getBirthday?.() },
    {
      label: 'setBirthday',
      run: async () => contactFor().setBirthday?.({ year: 1990, month: 5, day: 17 }),
    },
    {
      label: 'getNonGregorianBirthday',
      run: async () => contactFor().getNonGregorianBirthday?.(),
    },
    {
      label: 'setNonGregorianBirthday',
      run: async () =>
        contactFor().setNonGregorianBirthday?.({
          calendar: NonGregorianCalendar.hebrew,
          month: 1,
          day: 1,
        }),
    },
    { label: 'patch', run: () => contactFor().patch({ note: 'patched by the canary' }) },
    { label: 'update', run: () => contactFor().update(recordFrom('Updated', 'Demo')) },
    {
      label: 'editWithForm',
      run: () => contactFor().editWithForm({ allowsEditing: true, message: 'Symbiote' }),
    },
    { label: 'delete', run: () => contactFor().delete() },
  ]}
/>
<Card testID="contacts-accessor-card" title="Field accessors">
  <ChoiceRow testID="contacts-accessor-field" label="field (get<Field> / set<Field>)" options={FIELD_CHOICES} value={field} onChange={next => (field = next)} {color} />
  <Field testID="contacts-accessor-value-input" label="value for set" value={value} onChange={next => (value = next)} />
</Card>
<CallConsole
  prefix="contacts-accessor"
  title="Selected field"
  {color}
  calls={[
    { label: 'get', run: () => ACCESSORS[field].get(contactFor()) },
    { label: 'set', run: () => ACCESSORS[field].set(contactFor(), value) },
  ]}
/>
{#if id === ''}
  <text class="info-text">{MISSING}</text>
{:else}
  {#each groups as calls, index (index)}
    <CallConsole
      prefix={`contacts-collection-${index}`}
      title={calls[0].label.replace('add', '')}
      {color}
      {calls}
    />
  {/each}
{/if}
