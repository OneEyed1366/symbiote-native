import { createSignal } from 'solid-js';
import {
  Contact,
  ContactAccessButton,
  ContactField,
  ContactsSortOrder,
  addContactsChangeListener,
  getPermissionsAsync,
  removeAllContactsChangeListeners,
  requestPermissionsAsync,
} from '@symbiote-native/contacts/solid';
import type {
  ContactQueryOptions,
  CreateContactRecord,
} from '@symbiote-native/contacts/solid';
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ResultRow,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Contacts);

export type IQuery = {
  limit: string;
  offset: string;
  name: string;
  sortOrder: ContactsSortOrder;
  rawContacts: boolean;
};
export type ISetQuery = (patch: Partial<IQuery>) => void;

export const INITIAL_QUERY: IQuery = {
  limit: '10',
  offset: '0',
  name: '',
  sortOrder: ContactsSortOrder.UserDefault,
  rawContacts: false,
};

const SORT_CHOICES = [
  { label: 'userDefault', value: ContactsSortOrder.UserDefault },
  { label: 'givenName', value: ContactsSortOrder.GivenName },
  { label: 'familyName', value: ContactsSortOrder.FamilyName },
  { label: 'none', value: ContactsSortOrder.None },
] as const;

export const DEMO_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.PHONES,
  ContactField.EMAILS,
  ContactField.COMPANY,
];

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function toQueryOptions(query: IQuery): ContactQueryOptions {
  return {
    limit: optionalNumber(query.limit),
    offset: optionalNumber(query.offset),
    name: query.name.trim() === '' ? undefined : query.name.trim(),
    sortOrder: query.sortOrder,
    rawContacts: query.rawContacts,
  };
}

export function QueryCard(props: { query: IQuery; setQuery: ISetQuery }) {
  return (
    <Card testID="contacts-query-card" title="Query options">
      <Field
        testID="contacts-limit-input"
        label="limit"
        value={props.query.limit}
        onChange={limit => props.setQuery({ limit })}
      />
      <Field
        testID="contacts-offset-input"
        label="offset"
        value={props.query.offset}
        onChange={offset => props.setQuery({ offset })}
      />
      <Field
        testID="contacts-name-input"
        label="name filter"
        value={props.query.name}
        onChange={name => props.setQuery({ name })}
      />
      <ChoiceRow
        testID="contacts-sort"
        label="sortOrder"
        options={SORT_CHOICES}
        value={props.query.sortOrder}
        onChange={sortOrder => props.setQuery({ sortOrder })}
        color={color}
      />
      <ToggleRow
        testID="contacts-raw-switch"
        label="rawContacts (iOS)"
        value={props.query.rawContacts}
        onChange={rawContacts => props.setQuery({ rawContacts })}
        color={color}
      />
    </Card>
  );
}

export function recordFrom(givenName: string, familyName: string): CreateContactRecord {
  return {
    givenName,
    familyName,
    company: 'Symbiote',
    phones: [{ label: 'mobile', number: '+1 555 0100' }],
    emails: [{ label: 'work', address: 'demo@example.com' }],
  };
}

export function StaticCallsCard(props: {
  query: IQuery;
  setContactId: (id: string) => void;
}) {
  const options = () => toQueryOptions(props.query);
  const remember = (contact: Contact | null | undefined) => {
    if (contact) {
      props.setContactId(contact.id);
    }
    return contact?.id;
  };
  return (
    <CallConsole
      prefix="contacts-static"
      title="Contact (static calls)"
      color={color}
      hint="getAll, create and presentPicker remember the contact id for the instance calls below."
      calls={[
        {
          label: 'getAll',
          run: async () => {
            const all = await Contact.getAll(options());
            remember(all[0]);
            return all.map(contact => contact.id);
          },
        },
        {
          label: 'getAllDetails',
          run: () => Contact.getAllDetails(DEMO_FIELDS, options()),
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
        {
          label: 'presentPicker',
          run: async () => remember(await Contact.presentPicker()),
        },
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
  );
}

export function PermissionsCard() {
  const [count, setCount] = createSignal(0);
  const [isListening, setIsListening] = createSignal(false);

  const toggle = (next: boolean) => {
    setIsListening(next);
    if (next) {
      addContactsChangeListener(() => setCount(previous => previous + 1));
    } else {
      removeAllContactsChangeListeners();
    }
  };

  return (
    <>
      <CallConsole
        prefix="contacts-permissions"
        title="Permissions"
        color={color}
        calls={[
          { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
          { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
        ]}
      />
      <Card testID="contacts-listener-card" title="Change listener">
        <ToggleRow
          testID="contacts-listener-switch"
          label="addContactsChangeListener / removeAllContactsChangeListeners"
          value={isListening()}
          onChange={toggle}
          color={color}
        />
        <ResultRow
          testID="contacts-listener-count"
          label="change events"
          value={String(count())}
        />
        <text class="info-text">
          Edit a contact in the system Contacts app, then come back.
        </text>
      </Card>
    </>
  );
}

const CAPTIONS = [
  { label: 'default', value: 'default' },
  { label: 'email', value: 'email' },
  { label: 'phone', value: 'phone' },
] as const;

export function AccessButtonCard() {
  const [query, setQuery] = createSignal('');
  const [caption, setCaption] = createSignal<'default' | 'email' | 'phone'>('default');
  const [ignoredEmails, setIgnoredEmails] = createSignal('');
  const [ignoredPhones, setIgnoredPhones] = createSignal('');
  const split = (text: string) =>
    text
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);

  return (
    <Card testID="contacts-access-card" title="ContactAccessButton (iOS 18+)">
      <ResultRow
        testID="contacts-access-available"
        label="isAvailable"
        value={String(ContactAccessButton.isAvailable())}
      />
      <Field
        testID="contacts-access-query-input"
        label="query"
        value={query()}
        onChange={setQuery}
      />
      <ChoiceRow
        testID="contacts-access-caption"
        label="caption"
        options={CAPTIONS}
        value={caption()}
        onChange={next => setCaption(next)}
        color={color}
      />
      <Field
        testID="contacts-access-emails-input"
        label="ignoredEmails (comma separated)"
        value={ignoredEmails()}
        onChange={setIgnoredEmails}
      />
      <Field
        testID="contacts-access-phones-input"
        label="ignoredPhoneNumbers (comma separated)"
        value={ignoredPhones()}
        onChange={setIgnoredPhones}
      />
      <ContactAccessButton
        testID="contacts-access-button"
        query={query()}
        caption={caption()}
        ignoredEmails={split(ignoredEmails())}
        ignoredPhoneNumbers={split(ignoredPhones())}
        tintColor={color}
        backgroundColor="#ffffff"
        textColor="#0b1622"
        style={{ height: 52 }}
      />
    </Card>
  );
}
