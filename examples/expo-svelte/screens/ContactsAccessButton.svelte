<script lang="ts">
  import { ContactAccessButton } from '@symbiote-native/contacts/svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Contacts);
  const CAPTIONS = [
    { label: 'default', value: 'default' },
    { label: 'email', value: 'email' },
    { label: 'phone', value: 'phone' },
  ] as const;

  let query = $state('');
  let caption = $state<(typeof CAPTIONS)[number]['value']>('default');
  let ignoredEmails = $state('');
  let ignoredPhones = $state('');

  function split(text: string): string[] {
    return text
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }
</script>

<Card testID="contacts-access-card" title="ContactAccessButton (iOS 18+)">
  <ResultRow testID="contacts-access-available" label="isAvailable" value={String(ContactAccessButton.isAvailable())} />
  <Field testID="contacts-access-query-input" label="query" value={query} onChange={next => (query = next)} />
  <ChoiceRow testID="contacts-access-caption" label="caption" options={CAPTIONS} value={caption} onChange={next => (caption = next)} {color} />
  <Field testID="contacts-access-emails-input" label="ignoredEmails (comma separated)" value={ignoredEmails} onChange={next => (ignoredEmails = next)} />
  <Field testID="contacts-access-phones-input" label="ignoredPhoneNumbers (comma separated)" value={ignoredPhones} onChange={next => (ignoredPhones = next)} />
  <ContactAccessButton
    testID="contacts-access-button"
    {query}
    {caption}
    ignoredEmails={split(ignoredEmails)}
    ignoredPhoneNumbers={split(ignoredPhones)}
    tintColor={color}
    backgroundColor="#ffffff"
    textColor="#0b1622"
    style={{ height: 52 }}
  />
</Card>
