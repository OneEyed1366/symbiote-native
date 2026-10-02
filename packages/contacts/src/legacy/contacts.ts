import { UnavailabilityError, uuid } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import { Platform, Share } from 'react-native';
import type { ShareOptions } from 'react-native';
import { expoContacts, ON_CONTACTS_CHANGE_EVENT_NAME } from './native-module';
import type {
  Contact,
  ContactQuery,
  ContactResponse,
  Container,
  ContainerQuery,
  ContactsPermissionResponse,
  ExistingContact,
  FieldType,
  FormOptions,
  Group,
  GroupQuery,
} from './types';

export async function isAvailableAsync(): Promise<boolean> {
  return !!expoContacts.getContactsAsync;
}

export async function hasContactsAsync(): Promise<boolean> {
  if (!expoContacts.hasContactsAsync) {
    throw new UnavailabilityError('Contacts', 'hasContactsAsync');
  }
  return expoContacts.hasContactsAsync();
}

export async function writeContactToFileAsync(
  contactQuery: ContactQuery = {},
): Promise<string | undefined> {
  if (!expoContacts.writeContactToFileAsync) {
    throw new UnavailabilityError('Contacts', 'writeContactToFileAsync');
  }
  return expoContacts.writeContactToFileAsync(contactQuery);
}

export async function shareContactAsync(
  contactId: string,
  message: string,
  shareOptions: ShareOptions = {},
): Promise<unknown> {
  if (Platform.OS === 'ios') {
    const url = await writeContactToFileAsync({ id: contactId });
    return Share.share({ url, message }, shareOptions);
  }
  if (!expoContacts.shareContactAsync) {
    throw new UnavailabilityError('Contacts', 'shareContactAsync');
  }
  return expoContacts.shareContactAsync(contactId, message);
}

export async function getContactsAsync(
  contactQuery: ContactQuery = {},
): Promise<ContactResponse> {
  if (!expoContacts.getContactsAsync) {
    throw new UnavailabilityError('Contacts', 'getContactsAsync');
  }
  return expoContacts.getContactsAsync(contactQuery);
}

export async function getPagedContactsAsync(
  contactQuery: ContactQuery = {},
): Promise<ContactResponse> {
  const { pageSize, ...rest } = contactQuery;
  if (pageSize != null && pageSize <= 0) {
    throw new Error(
      'Error: Contacts.getPagedContactsAsync: `pageSize` must be greater than 0',
    );
  }
  return getContactsAsync({ ...rest, pageSize });
}

export async function getContactByIdAsync(
  id: string,
  fields?: FieldType[],
): Promise<ExistingContact | undefined> {
  if (!expoContacts.getContactsAsync) {
    throw new UnavailabilityError('Contacts', 'getContactsAsync');
  }
  const results = await expoContacts.getContactsAsync({
    pageSize: 1,
    pageOffset: 0,
    fields,
    id,
  });
  return results.data.length > 0 ? results.data[0] : undefined;
}

export async function addContactAsync(
  contact: Contact,
  containerId?: string,
): Promise<string> {
  if (!expoContacts.addContactAsync) {
    throw new UnavailabilityError('Contacts', 'addContactAsync');
  }
  return expoContacts.addContactAsync(contact, containerId);
}

export async function updateContactAsync(
  contact: { id: string } & Partial<ExistingContact>,
): Promise<string> {
  if (!expoContacts.updateContactAsync) {
    throw new UnavailabilityError('Contacts', 'updateContactAsync');
  }
  return expoContacts.updateContactAsync(contact);
}

export async function removeContactAsync(contactId: string): Promise<unknown> {
  if (!expoContacts.removeContactAsync) {
    throw new UnavailabilityError('Contacts', 'removeContactAsync');
  }
  return expoContacts.removeContactAsync(contactId);
}

export async function presentFormAsync(
  contactId?: string | null,
  contact?: Contact | null,
  formOptions: FormOptions = {},
): Promise<unknown> {
  if (!expoContacts.presentFormAsync) {
    throw new UnavailabilityError('Contacts', 'presentFormAsync');
  }
  if (Platform.OS !== 'ios') {
    return expoContacts.presentFormAsync(contactId, contact, formOptions);
  }
  let adjustedContact = contact;
  if (contactId) {
    if (adjustedContact) {
      adjustedContact = undefined;
      console.warn(
        'Expo.Contacts.presentFormAsync: You should define either a `contact` or a `contactId` but not both.',
      );
    }
    if (formOptions.isNew !== undefined) {
      console.warn(
        'Expo.Contacts.presentFormAsync: `formOptions.isNew` is not supported with `contactId`',
      );
    }
  }
  return expoContacts.presentFormAsync(contactId, adjustedContact, formOptions);
}

export async function addExistingGroupToContainerAsync(
  groupId: string,
  containerId: string,
): Promise<unknown> {
  if (!expoContacts.addExistingGroupToContainerAsync) {
    throw new UnavailabilityError(
      'Contacts',
      'addExistingGroupToContainerAsync',
    );
  }
  return expoContacts.addExistingGroupToContainerAsync(groupId, containerId);
}

export async function getDefaultContainerIdAsync(): Promise<string> {
  if (!expoContacts.getDefaultContainerIdentifierAsync) {
    throw new UnavailabilityError(
      'Contacts',
      'getDefaultContainerIdentifierAsync',
    );
  }
  return expoContacts.getDefaultContainerIdentifierAsync();
}

export async function createGroupAsync(
  name?: string,
  containerId?: string,
): Promise<string> {
  if (!expoContacts.createGroupAsync) {
    throw new UnavailabilityError('Contacts', 'createGroupAsync');
  }
  const groupName = name ?? uuid.v4();
  const resolvedContainerId =
    containerId ?? (await getDefaultContainerIdAsync());
  return expoContacts.createGroupAsync(groupName, resolvedContainerId);
}

export async function updateGroupNameAsync(
  groupName: string,
  groupId: string,
): Promise<unknown> {
  if (!expoContacts.updateGroupNameAsync) {
    throw new UnavailabilityError('Contacts', 'updateGroupNameAsync');
  }
  return expoContacts.updateGroupNameAsync(groupName, groupId);
}

export async function removeGroupAsync(groupId: string): Promise<unknown> {
  if (!expoContacts.removeGroupAsync) {
    throw new UnavailabilityError('Contacts', 'removeGroupAsync');
  }
  return expoContacts.removeGroupAsync(groupId);
}

export async function addExistingContactToGroupAsync(
  contactId: string,
  groupId: string,
): Promise<unknown> {
  if (!expoContacts.addExistingContactToGroupAsync) {
    throw new UnavailabilityError('Contacts', 'addExistingContactToGroupAsync');
  }
  return expoContacts.addExistingContactToGroupAsync(contactId, groupId);
}

export async function removeContactFromGroupAsync(
  contactId: string,
  groupId: string,
): Promise<unknown> {
  if (!expoContacts.removeContactFromGroupAsync) {
    throw new UnavailabilityError('Contacts', 'removeContactFromGroupAsync');
  }
  return expoContacts.removeContactFromGroupAsync(contactId, groupId);
}

export async function getGroupsAsync(groupQuery: GroupQuery): Promise<Group[]> {
  if (!expoContacts.getGroupsAsync) {
    throw new UnavailabilityError('Contacts', 'getGroupsAsync');
  }
  return expoContacts.getGroupsAsync(groupQuery);
}

export async function presentContactPickerAsync(): Promise<ExistingContact | null> {
  if (!expoContacts.presentContactPickerAsync) {
    throw new UnavailabilityError('Contacts', 'presentContactPickerAsync');
  }
  return expoContacts.presentContactPickerAsync();
}

export async function getContainersAsync(
  containerQuery: ContainerQuery,
): Promise<Container[]> {
  if (!expoContacts.getContainersAsync) {
    throw new UnavailabilityError('Contacts', 'getContainersAsync');
  }
  return expoContacts.getContainersAsync(containerQuery);
}

export async function presentAccessPickerAsync(): Promise<string[]> {
  if (!expoContacts.presentAccessPickerAsync) {
    throw new UnavailabilityError('Contacts', 'presentAccessPickerAsync');
  }
  return expoContacts.presentAccessPickerAsync();
}

export async function getPermissionsAsync(): Promise<ContactsPermissionResponse> {
  if (!expoContacts.getPermissionsAsync) {
    throw new UnavailabilityError('Contacts', 'getPermissionsAsync');
  }
  return expoContacts.getPermissionsAsync();
}

export async function requestPermissionsAsync(): Promise<ContactsPermissionResponse> {
  if (!expoContacts.requestPermissionsAsync) {
    throw new UnavailabilityError('Contacts', 'requestPermissionsAsync');
  }
  return expoContacts.requestPermissionsAsync();
}

export function addContactsChangeListener(
  listener: () => void,
): EventSubscription {
  if (!expoContacts.addListener) {
    throw new UnavailabilityError('Contacts', 'addContactsChangeListener');
  }
  const subscription = expoContacts.addListener(
    ON_CONTACTS_CHANGE_EVENT_NAME,
    listener,
  );
  return { remove: () => subscription.remove() };
}
