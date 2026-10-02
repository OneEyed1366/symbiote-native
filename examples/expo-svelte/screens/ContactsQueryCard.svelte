<script lang="ts">
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { SORT_CHOICES } from './contacts-query';
  import type { IQuery, ISetQuery } from './contacts-query';

  let { query, setQuery, color }: { query: IQuery; setQuery: ISetQuery; color: string } = $props();
</script>

<Card testID="contacts-query-card" title="Query options">
  <Field testID="contacts-limit-input" label="limit" value={query.limit} onChange={limit => setQuery({ limit })} />
  <Field testID="contacts-offset-input" label="offset" value={query.offset} onChange={offset => setQuery({ offset })} />
  <Field testID="contacts-name-input" label="name filter" value={query.name} onChange={name => setQuery({ name })} />
  <ChoiceRow testID="contacts-sort" label="sortOrder" options={SORT_CHOICES} value={query.sortOrder} onChange={sortOrder => setQuery({ sortOrder })} {color} />
  <ToggleRow testID="contacts-raw-switch" label="rawContacts (iOS)" value={query.rawContacts} onChange={rawContacts => setQuery({ rawContacts })} {color} />
</Card>
