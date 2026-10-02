import { defineComponent, ref } from 'vue';
import {
  ContactTypes,
  Fields,
  SortTypes,
  addContactAsync,
  addContactsChangeListener,
  addExistingContactToGroupAsync,
  addExistingGroupToContainerAsync,
  createGroupAsync,
  getContactByIdAsync,
  getContactsAsync,
  getContainersAsync,
  getDefaultContainerIdAsync,
  getGroupsAsync,
  getPagedContactsAsync,
  getPermissionsAsync,
  hasContactsAsync,
  isAvailableAsync,
  presentAccessPickerAsync,
  presentContactPickerAsync,
  presentFormAsync,
  removeContactAsync,
  removeContactFromGroupAsync,
  removeGroupAsync,
  requestPermissionsAsync,
  shareContactAsync,
  updateContactAsync,
  updateGroupNameAsync,
  writeContactToFileAsync,
} from '@symbiote-native/contacts/legacy';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Contacts);
const QUERY_FIELDS = [Fields.Name, Fields.PhoneNumbers, Fields.Emails];

function need(text: string, label: string): string {
  if (text.trim() === '') {
    throw new Error(`fill the ${label} field first`);
  }
  return text.trim();
}

type IIds = { contactId: string; groupId: string; containerId: string };
type ISetIds = (patch: Partial<IIds>) => void;
type IIdsProps = { ids: IIds; setIds: ISetIds };

function IdsCard(props: IIdsProps) {
  return (
    <Card testID="contacts-legacy-ids-card" title="Legacy ids">
      <Field
        testID="contacts-legacy-contact-input"
        label="contact id"
        value={props.ids.contactId}
        onChange={contactId => props.setIds({ contactId })}
      />
      <Field
        testID="contacts-legacy-group-input"
        label="group id"
        value={props.ids.groupId}
        onChange={groupId => props.setIds({ groupId })}
      />
      <Field
        testID="contacts-legacy-container-input"
        label="container id"
        value={props.ids.containerId}
        onChange={containerId => props.setIds({ containerId })}
      />
    </Card>
  );
}

function ContactCalls(props: IIdsProps) {
  const contact = () => need(props.ids.contactId, 'contact id');
  return (
    <CallConsole
      prefix="contacts-legacy-contacts"
      title="Legacy contacts"
      color={color}
      calls={[
        { label: 'isAvailableAsync', run: () => isAvailableAsync() },
        { label: 'hasContactsAsync', run: () => hasContactsAsync() },
        {
          label: 'getContactsAsync',
          run: async () => {
            const page = await getContactsAsync({
              pageSize: 10,
              fields: QUERY_FIELDS,
              sort: SortTypes.FirstName,
            });
            props.setIds({ contactId: page.data[0]?.id ?? props.ids.contactId });
            return page;
          },
        },
        {
          label: 'getPagedContactsAsync',
          run: () => getPagedContactsAsync({ pageSize: 3, pageOffset: 0 }),
        },
        {
          label: 'getContactByIdAsync',
          run: () => getContactByIdAsync(contact(), QUERY_FIELDS),
        },
        {
          label: 'addContactAsync',
          run: async () => {
            const id = await addContactAsync(
              {
                contactType: ContactTypes.Person,
                name: 'Legacy Demo',
                firstName: 'Legacy',
                lastName: 'Demo',
              },
              props.ids.containerId.trim() === '' ? undefined : props.ids.containerId.trim(),
            );
            props.setIds({ contactId: id });
            return id;
          },
        },
        {
          label: 'updateContactAsync',
          run: () => updateContactAsync({ id: contact(), note: 'updated by the canary' }),
        },
        { label: 'removeContactAsync', run: () => removeContactAsync(contact()) },
        { label: 'presentFormAsync', run: () => presentFormAsync(contact()) },
        {
          label: 'presentContactPickerAsync',
          run: async () => {
            const picked = await presentContactPickerAsync();
            props.setIds({ contactId: picked?.id ?? props.ids.contactId });
            return picked;
          },
        },
        { label: 'presentAccessPickerAsync', run: () => presentAccessPickerAsync() },
        {
          label: 'writeContactToFileAsync',
          run: () => writeContactToFileAsync({ id: contact() }),
        },
        {
          label: 'shareContactAsync',
          run: () => shareContactAsync(contact(), 'Shared from the canary'),
        },
      ]}
    />
  );
}

function GroupCalls(props: IIdsProps) {
  const group = () => need(props.ids.groupId, 'group id');
  return (
    <CallConsole
      prefix="contacts-legacy-groups"
      title="Legacy groups and containers"
      color={color}
      calls={[
        {
          label: 'getDefaultContainerIdAsync',
          run: async () => {
            const id = await getDefaultContainerIdAsync();
            props.setIds({ containerId: id });
            return id;
          },
        },
        { label: 'getContainersAsync', run: () => getContainersAsync({}) },
        {
          label: 'createGroupAsync',
          run: async () => {
            const id = await createGroupAsync('Legacy Group');
            props.setIds({ groupId: id });
            return id;
          },
        },
        { label: 'getGroupsAsync', run: () => getGroupsAsync({}) },
        {
          label: 'updateGroupNameAsync',
          run: () => updateGroupNameAsync('Renamed Legacy Group', group()),
        },
        { label: 'removeGroupAsync', run: () => removeGroupAsync(group()) },
        {
          label: 'addExistingContactToGroupAsync',
          run: () => addExistingContactToGroupAsync(need(props.ids.contactId, 'contact id'), group()),
        },
        {
          label: 'removeContactFromGroupAsync',
          run: () => removeContactFromGroupAsync(need(props.ids.contactId, 'contact id'), group()),
        },
        {
          label: 'addExistingGroupToContainerAsync',
          run: () => addExistingGroupToContainerAsync(group(), need(props.ids.containerId, 'container id')),
        },
      ]}
    />
  );
}

function PermissionCalls() {
  return (
    <CallConsole
      prefix="contacts-legacy-permissions"
      title="Legacy permissions and listener"
      color={color}
      calls={[
        { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
        { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
        {
          label: 'addContactsChangeListener',
          run: async () => {
            const subscription = addContactsChangeListener(() => undefined);
            subscription.remove();
            return 'subscribed and removed';
          },
        },
      ]}
    />
  );
}

export const LegacyCards = defineComponent(
  () => {
    const ids = ref<IIds>({ contactId: '', groupId: '', containerId: '' });
    const setIds: ISetIds = patch => {
      ids.value = { ...ids.value, ...patch };
    };
    return () => (
      <>
        <IdsCard ids={ids.value} setIds={setIds} />
        <ContactCalls ids={ids.value} setIds={setIds} />
        <GroupCalls ids={ids.value} setIds={setIds} />
        <PermissionCalls />
      </>
    );
  },
  { name: 'LegacyCards' },
);
