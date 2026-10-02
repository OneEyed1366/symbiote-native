import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fakes are real ES classes (not plain object mocks) so our wrapper classes can `extend` them -
// see @symbiote-native/file-system's src/next/next.test.ts for the same shape.

class FakeContact {
  id: string;
  deleted = false;

  constructor(id: string) {
    this.id = id;
  }

  delete = vi.fn(async () => {
    this.deleted = true;
  });

  getFullName = vi.fn(async () => 'Jane Doe');
  getGivenName = vi.fn(async () => 'Jane');
  getEmails = vi.fn(async () => [
    { id: 'e1', label: 'work', address: 'jane@example.com' },
  ]);
  addEmail = vi.fn(async () => 'e1');
  update = vi.fn(async () => undefined);
  patch = vi.fn(async () => undefined);

  static getAll = vi.fn(async () => [new FakeContact('1')]);
  static create = vi.fn(async (record: { givenName?: string }) => {
    const contact = new FakeContact('new-id');
    Object.assign(contact, record);
    return contact;
  });
  static getCount = vi.fn(async () => 2);
  static hasAny = vi.fn(async () => true);
  static presentPicker = vi.fn(async () => new FakeContact('picked-id'));
  static presentAccessPicker = vi.fn(async () => [
    new FakeContact('access-id'),
  ]);
  static getAllDetails = vi.fn(async () => [{ id: '1', givenName: 'Jane' }]);
}

class FakeGroup {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  getName = vi.fn(async () => 'Family');
  setName = vi.fn(async () => undefined);
  addContact = vi.fn(async () => undefined);
  getContacts = vi.fn(async () => [new FakeContact('member-1')]);
  delete = vi.fn(async () => undefined);
  static create = vi.fn(async (name: string) => new FakeGroup(`group-${name}`));
  static getAll = vi.fn(async () => [new FakeGroup('g1')]);
}

class FakeContainer {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  getName = vi.fn(async () => 'iCloud');
  getContacts = vi.fn(async () => [new FakeContact('c1')]);
  static getAll = vi.fn(async () => [new FakeContainer('container-1')]);
  static getDefault = vi.fn(async () => new FakeContainer('default-container'));
}

const FAKE_MODULE = {
  ContactNext: FakeContact,
  Contact: FakeContact,
  Group: FakeGroup,
  Container: FakeContainer,
  getPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  requestPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  })),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
  removeAllListeners: vi.fn(),
};

class FakeFallbackGroup {
  constructor(public readonly id: string) {}
}
class FakeFallbackContainer {
  constructor(public readonly id: string) {}
}

vi.mock('./native-module', () => ({
  expoContactsNext: FAKE_MODULE,
  ON_CONTACTS_CHANGE_EVENT_NAME: 'contactsDidChange',
  FallbackGroup: FakeFallbackGroup,
  FallbackContainer: FakeFallbackContainer,
}));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { Contact } = await import('./contact');
const { Group } = await import('./group');
const { Container } = await import('./container');
const { getPermissionsAsync, requestPermissionsAsync } =
  await import('./permissions');
const { addContactsChangeListener, removeAllContactsChangeListeners } =
  await import('./listeners');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Contact', () => {
  it('extends the native class', async () => {
    const [contact] = await Contact.getAll();
    expect(contact).toBeInstanceOf(FakeContact);
  });

  it('creates a contact and resolves fields directly on the instance', async () => {
    const contact = await Contact.create({ givenName: 'Jane' });
    expect(await contact.getFullName()).toBe('Jane Doe');
  });

  it('resolves the total contact count and existence check', async () => {
    expect(await Contact.getCount()).toBe(2);
    expect(await Contact.hasAny()).toBe(true);
  });

  it('presents the native contact picker', async () => {
    const picked = await Contact.presentPicker();
    expect(picked?.id).toBe('picked-id');
  });

  it('presents the iOS 18+ access picker', async () => {
    const picked = await Contact.presentAccessPicker();
    expect(picked).toHaveLength(1);
  });

  it('deletes a contact', async () => {
    const [contact] = await Contact.getAll();
    await contact.delete();
    expect(contact.deleted).toBe(true);
  });

  it('adds and lists emails', async () => {
    const [contact] = await Contact.getAll();
    const id = await contact.addEmail({
      label: 'work',
      address: 'jane@example.com',
    });
    expect(id).toBe('e1');
    expect(await contact.getEmails()).toHaveLength(1);
  });
});

describe('Group', () => {
  it('extends the native class on iOS', async () => {
    const [group] = await Group.getAll();
    expect(group).toBeInstanceOf(FakeGroup);
  });

  it('creates a group and lists its members', async () => {
    const group = await Group.create('Family');
    expect(group.id).toBe('group-Family');
    expect(await group.getContacts()).toHaveLength(1);
  });
});

describe('Container', () => {
  it('extends the native class on iOS', async () => {
    const [container] = await Container.getAll();
    expect(container).toBeInstanceOf(FakeContainer);
  });

  it('resolves the default container', async () => {
    const container = await Container.getDefault();
    expect(container?.id).toBe('default-container');
  });
});

describe('permissions and listeners', () => {
  it('gets and requests permissions', async () => {
    await getPermissionsAsync();
    await requestPermissionsAsync();
    expect(FAKE_MODULE.getPermissionsAsync).toHaveBeenCalled();
    expect(FAKE_MODULE.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('adds and removes a contacts-change listener', () => {
    const listener = vi.fn();
    addContactsChangeListener(listener);
    removeAllContactsChangeListeners();
    expect(FAKE_MODULE.addListener).toHaveBeenCalledWith(
      'contactsDidChange',
      listener,
    );
    expect(FAKE_MODULE.removeAllListeners).toHaveBeenCalledWith(
      'contactsDidChange',
    );
  });
});
