import { useState } from 'react';
import { Contact, Container, Group } from '@symbiote-native/contacts';
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

function GroupCalls({ contactId }: { contactId: string }) {
  const [groupId, setGroupId] = useState('');
  const [name, setName] = useState('Symbiote Group');
  const [containerId, setContainerId] = useState('');
  const group = () => new Group(required(groupId));
  const scoped = containerId.trim() === '' ? undefined : containerId.trim();

  return (
    <>
      <Card testID="contacts-group-card" title="Group (iOS only)">
        <Field
          testID="contacts-group-id-input"
          label="group id"
          value={groupId}
          onChange={setGroupId}
        />
        <Field
          testID="contacts-group-name-input"
          label="group name"
          value={name}
          onChange={setName}
        />
        <Field
          testID="contacts-group-container-input"
          label="containerId (optional scope)"
          value={containerId}
          onChange={setContainerId}
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
              const created = await Group.create(name, scoped);
              setGroupId(created.id);
              return created.id;
            },
          },
          {
            label: 'Group.getAll',
            run: async () =>
              Promise.all(
                (await Group.getAll(scoped)).map(async item => ({
                  id: item.id,
                  name: await item.getName(),
                })),
              ),
          },
          { label: 'getName', run: () => group().getName() },
          { label: 'setName', run: () => group().setName(name) },
          {
            label: 'addContact',
            run: () => group().addContact(new Contact(required(contactId))),
          },
          {
            label: 'removeContact',
            run: () => group().removeContact(new Contact(required(contactId))),
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
}

function ContainerCalls() {
  const [containerId, setContainerId] = useState('');
  const container = () => new Container(required(containerId));

  return (
    <>
      <Card testID="contacts-container-card" title="Container (iOS only)">
        <Field
          testID="contacts-container-id-input"
          label="container id"
          value={containerId}
          onChange={setContainerId}
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
                setContainerId(fallback.id);
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
}

export function GroupCards({ contactId }: { contactId: string }) {
  return (
    <>
      <GroupCalls contactId={contactId} />
      <ContainerCalls />
    </>
  );
}
