import { defineComponent, ref } from 'vue';
import { Contact, Container, Group } from '@symbiote-native/contacts/vue';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Contacts);
const REQUIRED = 'Fill the id field first, getAll returns ids to copy';

function required(id: string): string {
  if (id.trim() === '') {
    throw new Error(REQUIRED);
  }
  return id.trim();
}

const GroupCalls = defineComponent<{ contactId: string }>(
  props => {
    const groupId = ref('');
    const name = ref('Symbiote Group');
    const containerId = ref('');
    const group = () => new Group(required(groupId.value));
    const scoped = () => (containerId.value.trim() === '' ? undefined : containerId.value.trim());

    return () => (
      <>
        <Card testID="contacts-group-card" title="Group (iOS only)">
          <Field
            testID="contacts-group-id-input"
            label="group id"
            value={groupId.value}
            onChange={next => { groupId.value = next; }}
          />
          <Field
            testID="contacts-group-name-input"
            label="group name"
            value={name.value}
            onChange={next => { name.value = next; }}
          />
          <Field
            testID="contacts-group-container-input"
            label="containerId (optional scope)"
            value={containerId.value}
            onChange={next => { containerId.value = next; }}
          />
        </Card>
        <CallConsole
          prefix="contacts-group"
          title="Group calls"
          color={color}
          hint="Android has no groups, every call rejects with Not implemented there."
          calls={[
            {
              label: 'Group.create',
              run: async () => {
                const created = await Group.create(name.value, scoped());
                groupId.value = created.id;
                return created.id;
              },
            },
            {
              label: 'Group.getAll',
              run: async () =>
                Promise.all(
                  (await Group.getAll(scoped())).map(async item => ({
                    id: item.id,
                    name: await item.getName(),
                  })),
                ),
            },
            { label: 'getName', run: () => group().getName() },
            { label: 'setName', run: () => group().setName(name.value) },
            {
              label: 'addContact',
              run: () => group().addContact(new Contact(required(props.contactId))),
            },
            {
              label: 'removeContact',
              run: () => group().removeContact(new Contact(required(props.contactId))),
            },
            {
              label: 'getContacts',
              run: async () => (await group().getContacts()).map(item => item.id),
            },
            { label: 'delete', run: () => group().delete() },
          ]}
        />
      </>
    );
  },
  { name: 'GroupCalls', props: ['contactId'] },
);

const ContainerCalls = defineComponent(
  () => {
    const containerId = ref('');
    const container = () => new Container(required(containerId.value));

    return () => (
      <>
        <Card testID="contacts-container-card" title="Container (iOS only)">
          <Field
            testID="contacts-container-id-input"
            label="container id"
            value={containerId.value}
            onChange={next => { containerId.value = next; }}
          />
        </Card>
        <CallConsole
          prefix="contacts-container"
          title="Container calls"
          color={color}
          calls={[
            {
              label: 'Container.getAll',
              run: async () =>
                Promise.all(
                  (await Container.getAll()).map(async item => ({
                    id: item.id,
                    name: await item.getName(),
                    type: await item.getType(),
                  })),
                ),
            },
            {
              label: 'Container.getDefault',
              run: async () => {
                const fallback = await Container.getDefault();
                if (fallback) {
                  containerId.value = fallback.id;
                }
                return fallback?.id;
              },
            },
            { label: 'getName', run: () => container().getName() },
            { label: 'getType', run: () => container().getType() },
            {
              label: 'getGroups',
              run: async () => (await container().getGroups()).map(item => item.id),
            },
            {
              label: 'getContacts',
              run: async () => (await container().getContacts()).map(item => item.id),
            },
          ]}
        />
      </>
    );
  },
  { name: 'ContainerCalls' },
);

export function GroupCards(props: { contactId: string }) {
  return (
    <>
      <GroupCalls contactId={props.contactId} />
      <ContainerCalls />
    </>
  );
}
