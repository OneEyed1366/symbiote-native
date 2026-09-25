import { Platform, requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';
import type {
  ContactDate,
  ContactPatch,
  ContactQueryOptions,
  ContactsPermissionResponse,
  CreateContactRecord,
  CreateFormOptions,
  ExistingAddress,
  ExistingDate,
  ExistingEmail,
  ExistingExtraName,
  ExistingImAddress,
  ExistingPhone,
  ExistingRelation,
  ExistingSocialProfile,
  ExistingUrlAddress,
  FormOptions,
  NewAddress,
  NewDate,
  NewEmail,
  NewExtraName,
  NewImAddress,
  NewPhone,
  NewRelation,
  NewSocialProfile,
  NewUrlAddress,
  NonGregorianBirthday,
  PartialContactDetails,
} from './types';
import type { ContactField } from './enums';

const EXPO_CONTACTS_NEXT_MODULE_NAME = 'ExpoContactsNext';
export const ON_CONTACTS_CHANGE_EVENT_NAME = 'contactsDidChange';

export declare class NativeContact {
  constructor(id: string);
  readonly id: string;

  delete(): Promise<void>;
  patch(contact: ContactPatch): Promise<void>;
  update(contact: CreateContactRecord): Promise<void>;
  getDetails<T extends readonly ContactField[]>(
    fields?: T,
  ): Promise<PartialContactDetails<T>>;

  addEmail(email: NewEmail): Promise<string>;
  getEmails(): Promise<ExistingEmail[]>;
  deleteEmail(email: ExistingEmail): Promise<void>;
  updateEmail(updatedEmail: ExistingEmail): Promise<void>;

  addPhone(phone: NewPhone): Promise<string>;
  getPhones(): Promise<ExistingPhone[]>;
  deletePhone(phone: ExistingPhone): Promise<void>;
  updatePhone(updatedPhone: ExistingPhone): Promise<void>;

  addDate(date: NewDate): Promise<string>;
  getDates(): Promise<ExistingDate[]>;
  deleteDate(date: ExistingDate): Promise<void>;
  updateDate(updatedDate: ExistingDate): Promise<void>;

  /** @platform android */
  addExtraName(extraName: NewExtraName): Promise<string>;
  /** @platform android */
  getExtraNames(): Promise<ExistingExtraName[]>;
  /** @platform android */
  deleteExtraName(extraName: ExistingExtraName | string): Promise<void>;
  /** @platform android */
  updateExtraName(updatedExtraName: ExistingExtraName): Promise<void>;

  addAddress(address: NewAddress): Promise<string>;
  getAddresses(): Promise<ExistingAddress[]>;
  deleteAddress(address: ExistingAddress): Promise<void>;
  updateAddress(updatedAddress: ExistingAddress): Promise<void>;

  addRelation(relation: NewRelation): Promise<string>;
  getRelations(): Promise<ExistingRelation[]>;
  deleteRelation(relation: ExistingRelation | string): Promise<void>;
  updateRelation(updatedRelation: ExistingRelation): Promise<void>;

  addUrlAddress(urlAddress: NewUrlAddress): Promise<string>;
  getUrlAddresses(): Promise<ExistingUrlAddress[]>;
  deleteUrlAddress(urlAddress: ExistingUrlAddress): Promise<void>;
  updateUrlAddress(updatedUrlAddress: ExistingUrlAddress): Promise<void>;

  /** @platform ios */
  addSocialProfile?(socialProfile: NewSocialProfile): Promise<string>;
  /** @platform ios */
  getSocialProfiles?(): Promise<ExistingSocialProfile[]>;
  /** @platform ios */
  deleteSocialProfile?(socialProfile: ExistingSocialProfile): Promise<void>;
  /** @platform ios */
  updateSocialProfile?(
    updatedSocialProfile: ExistingSocialProfile,
  ): Promise<void>;

  /** @platform ios */
  addImAddress?(imAddress: NewImAddress): Promise<string>;
  /** @platform ios */
  getImAddresses?(): Promise<ExistingImAddress[]>;
  /** @platform ios */
  deleteImAddress?(imAddress: ExistingImAddress): Promise<void>;
  /** @platform ios */
  updateImAddress?(updatedImAddress: ExistingImAddress): Promise<void>;

  editWithForm(options?: FormOptions): Promise<boolean>;
  getFullName(): Promise<string>;

  /** @platform android */
  getIsFavourite?(): Promise<boolean>;
  /** @platform android */
  setIsFavourite?(isFavourite: boolean): Promise<boolean>;

  getGivenName(): Promise<string | null>;
  setGivenName(givenName: string | null): Promise<boolean>;
  getFamilyName(): Promise<string | null>;
  setFamilyName(familyName: string | null): Promise<boolean>;
  getMiddleName(): Promise<string | null>;
  setMiddleName(middleName: string | null): Promise<boolean>;

  /** @platform ios */
  getMaidenName?(): Promise<string | null>;
  /** @platform ios */
  setMaidenName?(maidenName: string | null): Promise<boolean>;
  /** @platform ios */
  getNickname?(): Promise<string | null>;
  /** @platform ios */
  setNickname?(nickname: string | null): Promise<boolean>;

  getPrefix(): Promise<string | null>;
  setPrefix(prefix: string | null): Promise<boolean>;
  getSuffix(): Promise<string | null>;
  setSuffix(suffix: string | null): Promise<boolean>;
  getPhoneticGivenName(): Promise<string | null>;
  setPhoneticGivenName(phoneticGivenName: string | null): Promise<boolean>;
  getPhoneticMiddleName(): Promise<string | null>;
  setPhoneticMiddleName(phoneticMiddleName: string | null): Promise<boolean>;
  getPhoneticFamilyName(): Promise<string | null>;
  setPhoneticFamilyName(phoneticFamilyName: string | null): Promise<boolean>;
  getCompany(): Promise<string | null>;
  setCompany(company: string | null): Promise<boolean>;
  getDepartment(): Promise<string | null>;
  setDepartment(department: string | null): Promise<boolean>;
  getJobTitle(): Promise<string | null>;
  setJobTitle(jobTitle: string | null): Promise<boolean>;
  getPhoneticCompanyName(): Promise<string | null>;
  setPhoneticCompanyName(phoneticCompanyName: string | null): Promise<boolean>;
  getNote(): Promise<string | null>;
  setNote(note: string | null): Promise<boolean>;
  getImage(): Promise<string | null>;
  setImage(imageUri: string | null): Promise<boolean>;
  getThumbnail(): Promise<string | null>;

  /** @platform ios */
  getBirthday?(): Promise<ContactDate | null>;
  /** @platform ios */
  setBirthday?(birthday: ContactDate | null): Promise<boolean>;
  /** @platform ios */
  getNonGregorianBirthday?(): Promise<NonGregorianBirthday | null>;
  /** @platform ios */
  setNonGregorianBirthday?(
    nonGregorianBirthday: NonGregorianBirthday | null,
  ): Promise<boolean>;

  static getAll(options?: ContactQueryOptions): Promise<NativeContact[]>;
  static create(contact: CreateContactRecord): Promise<NativeContact>;
  static presentCreateForm(
    contact?: CreateContactRecord,
    options?: CreateFormOptions,
  ): Promise<boolean>;
  static getCount(): Promise<number>;
  static hasAny(): Promise<boolean>;
  static presentPicker(): Promise<NativeContact | null>;
  /** @platform ios */
  static presentAccessPicker?(): Promise<NativeContact[]>;
  static getAllDetails<T extends readonly ContactField[]>(
    fields: T,
    options?: ContactQueryOptions,
  ): Promise<PartialContactDetails<T>[]>;
}

/** @platform ios - Android has no Group concept in expo-contacts. */
export declare class NativeGroup {
  constructor(id: string);
  readonly id: string;
  getName(): Promise<string | null>;
  setName(name: string): Promise<void>;
  addContact(contact: NativeContact): Promise<void>;
  removeContact(contact: NativeContact): Promise<void>;
  getContacts(options?: ContactQueryOptions): Promise<NativeContact[]>;
  delete(): Promise<void>;
  static create(name: string, containerId?: string): Promise<NativeGroup>;
  static getAll(containerId?: string): Promise<NativeGroup[]>;
}

/** @platform ios - Android has no Container concept in expo-contacts. */
export declare class NativeContainer {
  constructor(id: string);
  readonly id: string;
  getName(): Promise<string | null>;
  getType(): Promise<string | null>;
  getGroups(): Promise<NativeGroup[]>;
  getContacts(): Promise<NativeContact[]>;
  static getAll(): Promise<NativeContainer[]>;
  static getDefault(): Promise<NativeContainer | null>;
}

export class FallbackGroup {
  constructor(public readonly id: string) {}
  getName(): Promise<string | null> {
    throw new Error('Not implemented');
  }
  setName(_name: string): Promise<void> {
    throw new Error('Not implemented');
  }
  addContact(_contact: NativeContact): Promise<void> {
    throw new Error('Not implemented');
  }
  removeContact(_contact: NativeContact): Promise<void> {
    throw new Error('Not implemented');
  }
  getContacts(): Promise<NativeContact[]> {
    throw new Error('Not implemented');
  }
  delete(): Promise<void> {
    throw new Error('Not implemented');
  }
  static create(_name: string, _containerId?: string): Promise<FallbackGroup> {
    throw new Error('Not implemented');
  }
  static getAll(_containerId?: string): Promise<FallbackGroup[]> {
    throw new Error('Not implemented');
  }
}

export class FallbackContainer {
  constructor(public readonly id: string) {}
  getName(): Promise<string | null> {
    throw new Error('Not implemented');
  }
  getType(): Promise<string | null> {
    throw new Error('Not implemented');
  }
  getGroups(): Promise<FallbackGroup[]> {
    throw new Error('Not implemented');
  }
  getContacts(): Promise<NativeContact[]> {
    throw new Error('Not implemented');
  }
  static getAll(): Promise<FallbackContainer[]> {
    throw new Error('Not implemented');
  }
  static getDefault(): Promise<FallbackContainer | null> {
    throw new Error('Not implemented');
  }
}

export type INativeContactsNextModule = {
  ContactNext?: typeof NativeContact;
  Contact: typeof NativeContact;
  Group?: typeof NativeGroup;
  Container?: typeof NativeContainer;
  getPermissionsAsync(): Promise<ContactsPermissionResponse>;
  requestPermissionsAsync(): Promise<ContactsPermissionResponse>;
  addListener?(
    eventName: typeof ON_CONTACTS_CHANGE_EVENT_NAME,
    listener: () => void,
  ): EventSubscription;
  removeAllListeners?(eventName: typeof ON_CONTACTS_CHANGE_EVENT_NAME): void;
};

export const expoContactsNext = requireNativeModule<INativeContactsNextModule>(
  EXPO_CONTACTS_NEXT_MODULE_NAME,
);

// iOS registers the class as `ContactNext` (distinct from the deprecated legacy `Contact` JS
// class); Android registers it directly as `Contact`. Alias so both platforms expose `.Contact`.
if (Platform.OS === 'ios' && expoContactsNext.ContactNext) {
  expoContactsNext.Contact = expoContactsNext.ContactNext;
}
