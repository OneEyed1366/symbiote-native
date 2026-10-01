import {
  ContactField,
  ContactsSortOrder,
} from '@symbiote-native/contacts/svelte';
import type {
  ContactQueryOptions,
  CreateContactRecord,
} from '@symbiote-native/contacts/svelte';

export type IQuery = {
  limit: string;
  offset: string;
  name: string;
  sortOrder: ContactsSortOrder;
  rawContacts: boolean;
};
export type ISetQuery = (patch: Partial<IQuery>) => void;

export const INITIAL_QUERY: IQuery = {
  limit: '10',
  offset: '0',
  name: '',
  sortOrder: ContactsSortOrder.UserDefault,
  rawContacts: false,
};

export const SORT_CHOICES = [
  { label: 'userDefault', value: ContactsSortOrder.UserDefault },
  { label: 'givenName', value: ContactsSortOrder.GivenName },
  { label: 'familyName', value: ContactsSortOrder.FamilyName },
  { label: 'none', value: ContactsSortOrder.None },
] as const;

export const DEMO_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.PHONES,
  ContactField.EMAILS,
  ContactField.COMPANY,
];

function optionalNumber(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function toQueryOptions(query: IQuery): ContactQueryOptions {
  return {
    limit: optionalNumber(query.limit),
    offset: optionalNumber(query.offset),
    name: query.name.trim() === '' ? undefined : query.name.trim(),
    sortOrder: query.sortOrder,
    rawContacts: query.rawContacts,
  };
}

export function recordFrom(
  givenName: string,
  familyName: string,
): CreateContactRecord {
  return {
    givenName,
    familyName,
    company: 'Symbiote',
    phones: [{ label: 'mobile', number: '+1 555 0100' }],
    emails: [{ label: 'work', address: 'demo@example.com' }],
  };
}
