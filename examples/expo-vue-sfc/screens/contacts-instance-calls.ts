import type { Contact } from '@symbiote-native/contacts/vue';
import type { ICall } from '../components/call-console';

export const MISSING =
  'No contact id yet, use create / getAll / presentPicker above';

type IAccessor = {
  get: (contact: Contact) => Promise<unknown>;
  set: (contact: Contact, value: string) => Promise<unknown>;
};

export const ACCESSORS: Record<string, IAccessor> = {
  givenName: { get: c => c.getGivenName(), set: (c, v) => c.setGivenName(v) },
  middleName: {
    get: c => c.getMiddleName(),
    set: (c, v) => c.setMiddleName(v),
  },
  familyName: {
    get: c => c.getFamilyName(),
    set: (c, v) => c.setFamilyName(v),
  },
  maidenName: {
    get: async c => c.getMaidenName?.(),
    set: async (c, v) => c.setMaidenName?.(v),
  },
  nickname: {
    get: async c => c.getNickname?.(),
    set: async (c, v) => c.setNickname?.(v),
  },
  prefix: { get: c => c.getPrefix(), set: (c, v) => c.setPrefix(v) },
  suffix: { get: c => c.getSuffix(), set: (c, v) => c.setSuffix(v) },
  phoneticGivenName: {
    get: c => c.getPhoneticGivenName(),
    set: (c, v) => c.setPhoneticGivenName(v),
  },
  phoneticMiddleName: {
    get: c => c.getPhoneticMiddleName(),
    set: (c, v) => c.setPhoneticMiddleName(v),
  },
  phoneticFamilyName: {
    get: c => c.getPhoneticFamilyName(),
    set: (c, v) => c.setPhoneticFamilyName(v),
  },
  company: { get: c => c.getCompany(), set: (c, v) => c.setCompany(v) },
  department: {
    get: c => c.getDepartment(),
    set: (c, v) => c.setDepartment(v),
  },
  jobTitle: { get: c => c.getJobTitle(), set: (c, v) => c.setJobTitle(v) },
  phoneticCompanyName: {
    get: c => c.getPhoneticCompanyName(),
    set: (c, v) => c.setPhoneticCompanyName(v),
  },
  note: { get: c => c.getNote(), set: (c, v) => c.setNote(v) },
  image: {
    get: c => c.getImage(),
    set: (c, v) => c.setImage(v === '' ? null : v),
  },
};

export const FIELD_CHOICES = Object.keys(ACCESSORS).map(name => ({
  label: name,
  value: name,
}));

type IItemOps<T> = {
  add: () => Promise<unknown>;
  get: () => Promise<T[] | undefined>;
  remove: (item: T) => Promise<unknown>;
  update: (item: T) => Promise<unknown>;
};

function collectionCalls<T>(label: string, ops: IItemOps<T>): ICall[] {
  const first = async (): Promise<T> => {
    const [item] = (await ops.get()) ?? [];
    if (item === undefined) {
      throw new Error(`no ${label} on this contact, add one first`);
    }
    return item;
  };
  return [
    { label: `add${label}`, run: ops.add },
    { label: `get${label}s`, run: ops.get },
    {
      label: `delete${label} (first)`,
      run: async () => ops.remove(await first()),
    },
    {
      label: `update${label} (first)`,
      run: async () => ops.update(await first()),
    },
  ];
}

export function collectionGroups(c: Contact): ICall[][] {
  return [
    collectionCalls('Email', {
      add: () => c.addEmail({ label: 'work', address: 'extra@example.com' }),
      get: () => c.getEmails(),
      remove: item => c.deleteEmail(item),
      update: item => c.updateEmail({ ...item, label: 'home' }),
    }),
    collectionCalls('Phone', {
      add: () => c.addPhone({ label: 'home', number: '+1 555 0111' }),
      get: () => c.getPhones(),
      remove: item => c.deletePhone(item),
      update: item => c.updatePhone({ ...item, label: 'work' }),
    }),
    collectionCalls('Date', {
      add: () =>
        c.addDate({ label: 'anniversary', date: { month: 6, day: 1 } }),
      get: () => c.getDates(),
      remove: item => c.deleteDate(item),
      update: item => c.updateDate({ ...item, label: 'other' }),
    }),
    collectionCalls('ExtraName', {
      add: () => c.addExtraName({ label: 'alias', name: 'Demo Alias' }),
      get: () => c.getExtraNames(),
      remove: item => c.deleteExtraName(item),
      update: item => c.updateExtraName({ ...item, name: 'Renamed Alias' }),
    }),
    collectionCalls('Address', {
      add: () =>
        c.addAddress({
          label: 'home',
          street: '1 Main St',
          city: 'Springfield',
        }),
      get: () => c.getAddresses(),
      remove: item => c.deleteAddress(item),
      update: item => c.updateAddress({ ...item, city: 'Shelbyville' }),
    }),
    collectionCalls('Relation', {
      add: () => c.addRelation({ label: 'friend', name: 'Demo Friend' }),
      get: () => c.getRelations(),
      remove: item => c.deleteRelation(item),
      update: item => c.updateRelation({ ...item, label: 'sister' }),
    }),
    collectionCalls('UrlAddress', {
      add: () =>
        c.addUrlAddress({ label: 'home page', url: 'https://example.com' }),
      get: () => c.getUrlAddresses(),
      remove: item => c.deleteUrlAddress(item),
      update: item =>
        c.updateUrlAddress({ ...item, url: 'https://example.org' }),
    }),
    collectionCalls('SocialProfile', {
      add: async () =>
        c.addSocialProfile?.({
          label: 'twitter',
          username: 'demo',
          service: 'Twitter',
        }),
      get: async () => c.getSocialProfiles?.(),
      remove: async item => c.deleteSocialProfile?.(item),
      update: async item =>
        c.updateSocialProfile?.({ ...item, username: 'renamed' }),
    }),
    collectionCalls('ImAddress', {
      add: async () =>
        c.addImAddress?.({ label: 'chat', username: 'demo', service: 'Skype' }),
      get: async () => c.getImAddresses?.(),
      remove: async item => c.deleteImAddress?.(item),
      update: async item =>
        c.updateImAddress?.({ ...item, username: 'renamed' }),
    }),
  ];
}
