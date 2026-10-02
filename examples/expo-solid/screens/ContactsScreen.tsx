import { createSignal } from 'solid-js';
import { Contact, requestPermissionsAsync } from '@symbiote-native/contacts/solid';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import { ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { GroupCards } from './contacts-groups';
import { InstanceCards } from './contacts-instance';
import { LegacyCards } from './contacts-legacy';
import {
  AccessButtonCard,
  INITIAL_QUERY,
  PermissionsCard,
  QueryCard,
  StaticCallsCard,
  recordFrom,
} from './contacts-modern';
import type { IQuery, ISetQuery } from './contacts-modern';

const color = lineColorOf(ROUTE_NAME.Contacts);

function ContactScenarios(props: { setContactId: (id: string) => void }) {
  return (
    <>
      <Scenario
        testID="contacts-pick-scenario"
        title="Fill a form from the address book"
        why="Invite a friend or pick a recipient without asking the user to type a name. The system picker shows the address book and returns only the contact the user taps."
        steps={['Press Allow access and accept', 'Press Pick a contact and tap one']}
        expect="The output shows the full name of the chosen contact. The contact is also remembered for the instance calls in the explorer."
      >
        <CallConsole
          isBare
          prefix="contacts-pick"
          title="Pick a contact"
          color={color}
          calls={[
            { label: 'Allow access', run: () => requestPermissionsAsync() },
            {
              label: 'Pick a contact',
              run: async () => {
                const picked = await Contact.presentPicker();
                if (picked) {
                  props.setContactId(picked.id);
                }
                return picked ? await picked.getFullName() : 'nothing picked';
              },
            },
          ]}
        />
      </Scenario>
      <Scenario
        testID="contacts-save-scenario"
        title="Save a new contact from the app"
        why="Let users keep a business card or a support number in their own address book. The system form lets them review and save, so no write permission is needed up front."
        steps={['Press Open new-contact form', 'Save or cancel in the system form']}
        expect="The form opens prefilled with name, company, phone and email. After Save the contact appears in the system Contacts app."
      >
        <CallConsole
          isBare
          prefix="contacts-save"
          title="New contact form"
          color={color}
          calls={[
            {
              label: 'Open new-contact form',
              run: () => Contact.presentCreateForm(recordFrom('Form', 'Demo')),
            },
          ]}
        />
      </Scenario>
    </>
  );
}

export function ContactsScreen() {
  const [query, setQueryState] = createSignal<IQuery>(INITIAL_QUERY);
  const [contactId, setContactId] = createSignal('');
  const setQuery: ISetQuery = patch =>
    setQueryState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE_NAME.Contacts}
      testID="contacts-scroll"
      title="Contacts"
      body="Read and manage the user's address book: pick a contact for a form, save a new one, search, edit, group and listen for changes. Everything asks for permission first."
    >
      <ContactScenarios setContactId={setContactId} />
      <Explorer testID="contacts-explorer" color={color}>
        <PermissionsCard />
        <QueryCard query={query()} setQuery={setQuery} />
        <StaticCallsCard query={query()} setContactId={setContactId} />
        <InstanceCards contactId={contactId()} setContactId={setContactId} />
        <GroupCards contactId={contactId()} />
        <AccessButtonCard />
        <LegacyCards />
      </Explorer>
    </ScreenShell>
  );
}
