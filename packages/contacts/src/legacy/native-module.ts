import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  Contact,
  ContactQuery,
  ContactResponse,
  Container,
  ContainerQuery,
  ContactsPermissionResponse,
  ExistingContact,
  FormOptions,
  Group,
  GroupQuery,
} from './types';

const EXPO_CONTACTS_MODULE_NAME = 'ExpoContacts';
export const ON_CONTACTS_CHANGE_EVENT_NAME = 'onContactsChange';

export type INativeContactsModule = {
  hasContactsAsync?(): Promise<boolean>;
  shareContactAsync?(contactId: string, message: string): Promise<unknown>;
  getContactsAsync?(contactQuery: ContactQuery): Promise<ContactResponse>;
  addContactAsync?(contact: Contact, containerId?: string): Promise<string>;
  updateContactAsync?(
    contact: { id: string } & Partial<ExistingContact>,
  ): Promise<string>;
  removeContactAsync?(contactId: string): Promise<unknown>;
  writeContactToFileAsync?(
    contactQuery: ContactQuery,
  ): Promise<string | undefined>;
  presentFormAsync?(
    contactId?: string | null,
    contact?: Contact | null,
    formOptions?: FormOptions,
  ): Promise<unknown>;
  addExistingGroupToContainerAsync?(
    groupId: string,
    containerId: string,
  ): Promise<unknown>;
  createGroupAsync?(name: string, containerId?: string): Promise<string>;
  updateGroupNameAsync?(groupName: string, groupId: string): Promise<unknown>;
  removeGroupAsync?(groupId: string): Promise<unknown>;
  addExistingContactToGroupAsync?(
    contactId: string,
    groupId: string,
  ): Promise<unknown>;
  removeContactFromGroupAsync?(
    contactId: string,
    groupId: string,
  ): Promise<unknown>;
  getGroupsAsync?(groupQuery: GroupQuery): Promise<Group[]>;
  presentContactPickerAsync?(): Promise<ExistingContact | null>;
  getDefaultContainerIdentifierAsync?(): Promise<string>;
  getContainersAsync?(containerQuery: ContainerQuery): Promise<Container[]>;
  presentAccessPickerAsync?(): Promise<string[]>;
  getPermissionsAsync?(): Promise<ContactsPermissionResponse>;
  requestPermissionsAsync?(): Promise<ContactsPermissionResponse>;
  addListener?(
    eventName: typeof ON_CONTACTS_CHANGE_EVENT_NAME,
    listener: () => void,
  ): EventSubscription;
};

export const expoContacts = requireNativeModule<INativeContactsModule>(
  EXPO_CONTACTS_MODULE_NAME,
);
