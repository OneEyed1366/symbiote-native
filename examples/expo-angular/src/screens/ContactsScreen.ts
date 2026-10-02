import { Component, signal } from '@angular/core';
import {
  Contact,
  requestPermissionsAsync,
} from '@symbiote-native/contacts/angular';
import { CallConsole } from '../components/CallConsole';
import { Explorer } from '../components/Explorer';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import type { ICall } from '../components/call-console';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { ContactsAccessButton } from './ContactsAccessButton';
import { ContactsGroups } from './ContactsGroups';
import { ContactsInstance } from './ContactsInstance';
import { ContactsLegacy } from './ContactsLegacy';
import { ContactsPermissions } from './ContactsPermissions';
import { ContactsQueryCard } from './ContactsQueryCard';
import { ContactsStaticCalls } from './ContactsStaticCalls';
import { INITIAL_QUERY, recordFrom } from './contacts-query';
import type { IQuery } from './contacts-query';

@Component({
  selector: 'ContactsScreen',
  standalone: true,
  imports: [
    CallConsole,
    ContactsAccessButton,
    ContactsGroups,
    ContactsInstance,
    ContactsLegacy,
    ContactsPermissions,
    ContactsQueryCard,
    ContactsStaticCalls,
    Explorer,
    Scenario,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="contacts-scroll"
      title="Contacts"
      body="Read and manage the user's address book: pick a contact for a form, save a new one, search, edit, group and listen for changes. Everything asks for permission first."
    >
      <Scenario
        testID="contacts-pick-scenario"
        title="Fill a form from the address book"
        why="Invite a friend or pick a recipient without asking the user to type a name. The system picker shows the address book and returns only the contact the user taps."
        [steps]="pickSteps"
        expect="The output shows the full name of the chosen contact. The contact is also remembered for the instance calls in the explorer."
      >
        <CallConsole
          isBare
          prefix="contacts-pick"
          title="Pick a contact"
          [color]="color"
          [calls]="pickCalls"
        />
      </Scenario>
      <Scenario
        testID="contacts-save-scenario"
        title="Save a new contact from the app"
        why="Let users keep a business card or a support number in their own address book. The system form lets them review and save, so no write permission is needed up front."
        [steps]="saveSteps"
        expect="The form opens prefilled with name, company, phone and email. After Save the contact appears in the system Contacts app."
      >
        <CallConsole
          isBare
          prefix="contacts-save"
          title="New contact form"
          [color]="color"
          [calls]="saveCalls"
        />
      </Scenario>
      <Explorer testID="contacts-explorer" [color]="color">
        <ng-template>
          <ContactsPermissions />
          <ContactsQueryCard [(query)]="query" [color]="color" />
          <ContactsStaticCalls
            [query]="query()"
            [color]="color"
            [(contactId)]="contactId"
          />
          <ContactsInstance [(contactId)]="contactId" />
          <ContactsGroups [contactId]="contactId()" />
          <ContactsAccessButton />
          <ContactsLegacy />
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class ContactsScreen {
  readonly route = ROUTE_NAME.Contacts;
  readonly color = lineColorOf(ROUTE_NAME.Contacts);
  readonly pickSteps = [
    'Press Allow access and accept',
    'Press Pick a contact and tap one',
  ];
  readonly saveSteps = [
    'Press Open new-contact form',
    'Save or cancel in the system form',
  ];

  readonly query = signal<IQuery>({ ...INITIAL_QUERY });
  readonly contactId = signal('');

  readonly pickCalls: ICall[] = [
    { label: 'Allow access', run: () => requestPermissionsAsync() },
    {
      label: 'Pick a contact',
      run: async () => {
        const picked = await Contact.presentPicker();
        if (picked) {
          this.contactId.set(picked.id);
        }
        return picked ? await picked.getFullName() : 'nothing picked';
      },
    },
  ];

  readonly saveCalls: ICall[] = [
    {
      label: 'Open new-contact form',
      run: () => Contact.presentCreateForm(recordFrom('Form', 'Demo')),
    },
  ];
}
