import type { PermissionResponse } from 'expo-modules-core';
import type {
  ContactField,
  ContactsSortOrder,
  NonGregorianCalendar,
} from './enums';

export type ContactsPermissionResponse = PermissionResponse & {
  accessPrivileges?: 'all' | 'limited' | 'none';
};

export type ContactQueryOptions = {
  limit?: number;
  offset?: number;
  sortOrder?: ContactsSortOrder;
  name?: string;
  /** @platform ios */
  rawContacts?: boolean;
};

export type FormOptions = {
  displayedPropertyKeys?: ContactField[];
  message?: string;
  alternateName?: string;
  allowsEditing?: boolean;
  allowsActions?: boolean;
  shouldShowLinkedContacts?: boolean;
  isNew?: boolean;
  cancelButtonTitle?: string;
  showsCancelButton?: boolean;
  preventAnimation?: boolean;
  groupId?: string;
};

export type CreateFormOptions = {
  cancelButtonTitle?: string;
  showsCancelButton?: boolean;
  preventAnimation?: boolean;
};

export type NewEmail = { label?: string; address?: string };
export type ExistingEmail = NewEmail & { id: string };
export type NewPhone = { label?: string; number?: string };
export type ExistingPhone = NewPhone & { id: string };
export type NewDate = { label?: string; date?: ContactDate };
export type ExistingDate = NewDate & { id: string };
export type NewExtraName = { label?: string; name?: string };
export type ExistingExtraName = NewExtraName & { id: string };
export type NewAddress = {
  label?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  region?: string;
  country?: string;
};
export type ExistingAddress = NewAddress & { id: string };
export type NewRelation = { label?: string; name?: string };
export type ExistingRelation = NewRelation & { id: string };
export type NewUrlAddress = { label?: string; url?: string };
export type ExistingUrlAddress = NewUrlAddress & { id: string };
export type NewImAddress = {
  label?: string;
  username?: string;
  service?: string;
};
export type ExistingImAddress = NewImAddress & { id: string };
export type NewSocialProfile = {
  label?: string;
  username?: string;
  service?: string;
  url?: string;
  userId?: string;
};
export type ExistingSocialProfile = NewSocialProfile & { id: string };

export type ContactDate = { year?: number; month: number; day: number };

/** @platform ios */
export type NonGregorianBirthday = {
  year?: number;
  month: number;
  day: number;
  calendar: NonGregorianCalendar;
};

export type ContactPatch = {
  isFavourite?: boolean | null;
  givenName?: string | null;
  middleName?: string | null;
  familyName?: string | null;
  nickname?: string | null;
  maidenName?: string | null;
  prefix?: string | null;
  suffix?: string | null;
  phoneticGivenName?: string | null;
  phoneticMiddleName?: string | null;
  phoneticFamilyName?: string | null;
  company?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  phoneticCompanyName?: string | null;
  note?: string | null;
  image?: string | null;
  birthday?: ContactDate | null;
  nonGregorianBirthday?: NonGregorianBirthday | null;
  emails?: (ExistingEmail | NewEmail)[];
  phones?: (ExistingPhone | NewPhone)[];
  dates?: (ExistingDate | NewDate)[];
  extraNames?: (ExistingExtraName | NewExtraName)[];
  addresses?: (ExistingAddress | NewAddress)[];
  relations?: (ExistingRelation | NewRelation)[];
  urlAddresses?: (ExistingUrlAddress | NewUrlAddress)[];
  socialProfiles?: (ExistingSocialProfile | NewSocialProfile)[];
  imAddresses?: (ExistingImAddress | NewImAddress)[];
};

export type CreateContactRecord = {
  isFavourite?: boolean;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  maidenName?: string;
  nickname?: string;
  prefix?: string;
  suffix?: string;
  phoneticGivenName?: string;
  phoneticMiddleName?: string;
  phoneticFamilyName?: string;
  company?: string;
  department?: string;
  jobTitle?: string;
  phoneticCompanyName?: string;
  note?: string;
  image?: string;
  birthday?: ContactDate;
  nonGregorianBirthday?: NonGregorianBirthday;
  emails?: NewEmail[];
  dates?: NewDate[];
  phones?: NewPhone[];
  addresses?: NewAddress[];
  relations?: NewRelation[];
  urlAddresses?: NewUrlAddress[];
  imAddresses?: NewImAddress[];
  socialProfiles?: NewSocialProfile[];
  extraNames?: NewExtraName[];
};

export type ContactDetails = {
  isFavourite: boolean;
  fullName: string | null;
  givenName: string | null;
  middleName: string | null;
  familyName: string | null;
  maidenName?: string | null;
  nickname?: string | null;
  prefix: string | null;
  suffix: string | null;
  phoneticGivenName: string | null;
  phoneticMiddleName: string | null;
  phoneticFamilyName: string | null;
  company: string | null;
  department: string | null;
  jobTitle?: string;
  phoneticCompanyName?: string;
  note: string | null;
  image: string | null;
  thumbnail: string | null;
  birthday?: ContactDate | null;
  nonGregorianBirthday?: NonGregorianBirthday | null;
  emails: ExistingEmail[];
  dates: ExistingDate[];
  phones: ExistingPhone[];
  extraNames: ExistingExtraName[];
  addresses: ExistingAddress[];
  relations: ExistingRelation[];
  urlAddresses: ExistingUrlAddress[];
  socialProfiles: ExistingSocialProfile[];
  imAddresses: ExistingImAddress[];
};

export type ContactFieldKey = {
  [ContactField.IS_FAVOURITE]: 'isFavourite';
  [ContactField.FULL_NAME]: 'fullName';
  [ContactField.GIVEN_NAME]: 'givenName';
  [ContactField.MIDDLE_NAME]: 'middleName';
  [ContactField.FAMILY_NAME]: 'familyName';
  [ContactField.MAIDEN_NAME]: 'maidenName';
  [ContactField.NICKNAME]: 'nickname';
  [ContactField.PREFIX]: 'prefix';
  [ContactField.SUFFIX]: 'suffix';
  [ContactField.PHONETIC_GIVEN_NAME]: 'phoneticGivenName';
  [ContactField.PHONETIC_MIDDLE_NAME]: 'phoneticMiddleName';
  [ContactField.PHONETIC_FAMILY_NAME]: 'phoneticFamilyName';
  [ContactField.COMPANY]: 'company';
  [ContactField.PHONETIC_COMPANY_NAME]: 'phoneticCompanyName';
  [ContactField.DEPARTMENT]: 'department';
  [ContactField.JOB_TITLE]: 'jobTitle';
  [ContactField.NOTE]: 'note';
  [ContactField.IMAGE]: 'image';
  [ContactField.THUMBNAIL]: 'thumbnail';
  [ContactField.BIRTHDAY]: 'birthday';
  [ContactField.NON_GREGORIAN_BIRTHDAY]: 'nonGregorianBirthday';
  [ContactField.EMAILS]: 'emails';
  [ContactField.PHONES]: 'phones';
  [ContactField.ADDRESSES]: 'addresses';
  [ContactField.DATES]: 'dates';
  [ContactField.EXTRA_NAMES]: 'extraNames';
  [ContactField.RELATIONS]: 'relations';
  [ContactField.URL_ADDRESSES]: 'urlAddresses';
  [ContactField.SOCIAL_PROFILES]: 'socialProfiles';
  [ContactField.IM_ADDRESSES]: 'imAddresses';
};

export type PartialContactDetails<T extends readonly ContactField[]> = {
  id: string;
} & {
  [K in T[number]]: ContactDetails[K];
};
