import type { PermissionResponse } from 'expo-modules-core';
import type {
  CalendarFormats,
  ContactTypes,
  ContainerTypes,
  Fields,
  SortTypes,
} from './enums';

export type ContactsPermissionResponse = PermissionResponse & {
  accessPrivileges?: 'all' | 'limited' | 'none';
};

export type CalendarFormatType = CalendarFormats | `${CalendarFormats}`;
export type ContainerType = ContainerTypes | `${ContainerTypes}`;
export type ContactType = ContactTypes | `${ContactTypes}`;
export type FieldType = Fields | `${Fields}`;

export type Date = {
  day: number;
  month: number;
  year?: number;
  id?: string;
  label?: string;
  format?: CalendarFormatType;
};

export type Relationship = { label: string; name?: string; id?: string };
export type Email = {
  email?: string;
  isPrimary?: boolean;
  label: string;
  id?: string;
};
export type PhoneNumber = {
  number?: string;
  isPrimary?: boolean;
  digits?: string;
  countryCode?: string;
  label: string;
  id?: string;
};
export type Address = {
  street?: string;
  city?: string;
  country?: string;
  region?: string;
  neighborhood?: string;
  postalCode?: string;
  poBox?: string;
  isoCountryCode?: string;
  label: string;
  id?: string;
};
export type SocialProfile = {
  service?: string;
  localizedProfile?: string;
  url?: string;
  username?: string;
  userId?: string;
  label: string;
  id?: string;
};
export type InstantMessageAddress = {
  service?: string;
  username?: string;
  localizedService?: string;
  label: string;
  id?: string;
};
export type UrlAddress = { label: string; url?: string; id?: string };
export type Image = {
  uri?: string;
  width?: number;
  height?: number;
  base64?: string;
};

export type Contact = {
  contactType: ContactType;
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  maidenName?: string;
  namePrefix?: string;
  nameSuffix?: string;
  nickname?: string;
  phoneticFirstName?: string;
  phoneticMiddleName?: string;
  phoneticLastName?: string;
  company?: string;
  jobTitle?: string;
  department?: string;
  note?: string;
  imageAvailable?: boolean;
  image?: Image;
  rawImage?: Image;
  birthday?: Date;
  dates?: Date[];
  relationships?: Relationship[];
  emails?: Email[];
  phoneNumbers?: PhoneNumber[];
  addresses?: Address[];
  instantMessageAddresses?: InstantMessageAddress[];
  urlAddresses?: UrlAddress[];
  nonGregorianBirthday?: Date;
  socialProfiles?: SocialProfile[];
  isFavorite?: boolean;
};

export type ExistingContact = Contact & { id: string };

export type ContactResponse = {
  data: ExistingContact[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ContactSort = `${SortTypes}`;

export type ContactQuery = {
  pageSize?: number;
  pageOffset?: number;
  fields?: FieldType[];
  sort?: ContactSort;
  name?: string;
  id?: string | string[];
  groupId?: string;
  containerId?: string;
  rawContacts?: boolean;
};

export type FormOptions = {
  displayedPropertyKeys?: FieldType[];
  message?: string;
  alternateName?: string;
  allowsEditing?: boolean;
  allowsActions?: boolean;
  shouldShowLinkedContacts?: boolean;
  isNew?: boolean;
  cancelButtonTitle?: string;
  preventAnimation?: boolean;
  groupId?: string;
};

export type GroupQuery = {
  groupId?: string;
  groupName?: string;
  containerId?: string;
};
export type Group = { name?: string; id?: string };

export type ContainerQuery = {
  contactId?: string;
  groupId?: string;
  containerId?: string | string[];
};
export type Container = { name: string; id: string; type: ContainerType };
