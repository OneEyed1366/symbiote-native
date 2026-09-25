import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CONTACTS = {
  hasContactsAsync: vi.fn(async () => true),
  writeContactToFileAsync: vi.fn(async () => 'file:///contact.vcf'),
  shareContactAsync: vi.fn(async () => ({ action: 'sharedAction' })),
  getContactsAsync: vi.fn(async () => ({
    data: [{ id: '1', contactType: 'person', name: 'Jane Doe' }],
    hasNextPage: false,
    hasPreviousPage: false,
  })),
  addContactAsync: vi.fn(async () => 'new-id'),
  updateContactAsync: vi.fn(async () => 'updated-id'),
  removeContactAsync: vi.fn(async () => undefined),
  presentFormAsync: vi.fn(async () => true),
  addExistingGroupToContainerAsync: vi.fn(async () => undefined),
  createGroupAsync: vi.fn(async () => 'group-id'),
  updateGroupNameAsync: vi.fn(async () => undefined),
  removeGroupAsync: vi.fn(async () => undefined),
  addExistingContactToGroupAsync: vi.fn(async () => undefined),
  removeContactFromGroupAsync: vi.fn(async () => undefined),
  getGroupsAsync: vi.fn(async () => [{ id: 'g1', name: 'Family' }]),
  presentContactPickerAsync: vi.fn(async () => null),
  getDefaultContainerIdentifierAsync: vi.fn(async () => 'default-container'),
  getContainersAsync: vi.fn(async () => [
    { id: 'c1', name: 'iCloud', type: 'local' },
  ]),
  presentAccessPickerAsync: vi.fn(async () => ['1']),
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
};

vi.mock('./native-module', () => ({
  expoContacts: FAKE_NATIVE_CONTACTS,
  ON_CONTACTS_CHANGE_EVENT_NAME: 'onContactsChange',
}));

vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
  uuid: { v4: () => 'generated-uuid' },
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Share: { share: vi.fn(async () => ({ action: 'sharedAction' })) },
}));

const {
  isAvailableAsync,
  hasContactsAsync,
  getContactsAsync,
  getPagedContactsAsync,
  getContactByIdAsync,
  addContactAsync,
  updateContactAsync,
  removeContactAsync,
  writeContactToFileAsync,
  presentFormAsync,
  createGroupAsync,
  getDefaultContainerIdAsync,
  getGroupsAsync,
  getContainersAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  addContactsChangeListener,
} = await import('./contacts');

afterEach(() => {
  vi.clearAllMocks();
});

describe('presentFormAsync', () => {
  it('invalidates contact when ID is provided', async () => {
    const contactId = '<DEBUG>';
    const contact = {
      id: '<DEBUG_ID>',
      contactType: 'person' as never,
      name: '<DEBUG_NAME>',
    };
    await presentFormAsync(contactId, contact);
    expect(FAKE_NATIVE_CONTACTS.presentFormAsync).toHaveBeenCalledWith(
      contactId,
      undefined,
      {},
    );
  });

  it('passes contact through unchanged when no contactId is given', async () => {
    const contact = {
      id: '<DEBUG_ID>',
      contactType: 'person' as never,
      name: '<DEBUG_NAME>',
    };
    await presentFormAsync(null, contact);
    expect(FAKE_NATIVE_CONTACTS.presentFormAsync).toHaveBeenCalledWith(
      null,
      contact,
      {},
    );
  });
});

describe('read/write delegation', () => {
  it('reports availability from the presence of getContactsAsync', async () => {
    expect(await isAvailableAsync()).toBe(true);
  });

  it('delegates hasContactsAsync', async () => {
    expect(await hasContactsAsync()).toBe(true);
  });

  it('delegates getContactsAsync', async () => {
    const response = await getContactsAsync({ name: 'Jane' });
    expect(response.data).toHaveLength(1);
    expect(FAKE_NATIVE_CONTACTS.getContactsAsync).toHaveBeenCalledWith({
      name: 'Jane',
    });
  });

  it('rejects a non-positive pageSize in getPagedContactsAsync', async () => {
    await expect(getPagedContactsAsync({ pageSize: 0 })).rejects.toThrow(
      /pageSize.*greater than 0/,
    );
  });

  it('delegates getPagedContactsAsync with a valid pageSize', async () => {
    await getPagedContactsAsync({ pageSize: 10 });
    expect(FAKE_NATIVE_CONTACTS.getContactsAsync).toHaveBeenCalledWith({
      pageSize: 10,
    });
  });

  it('resolves a single contact by id', async () => {
    const contact = await getContactByIdAsync('1');
    expect(contact?.id).toBe('1');
  });

  it('resolves undefined when no contact matches the id', async () => {
    FAKE_NATIVE_CONTACTS.getContactsAsync.mockResolvedValueOnce({
      data: [],
      hasNextPage: false,
      hasPreviousPage: false,
    });
    expect(await getContactByIdAsync('missing')).toBeUndefined();
  });

  it('adds, updates, and removes a contact', async () => {
    await addContactAsync({ contactType: 'person' as never, name: 'Jane' });
    await updateContactAsync({ id: '1', name: 'Jane Updated' });
    await removeContactAsync('1');
    expect(FAKE_NATIVE_CONTACTS.addContactAsync).toHaveBeenCalled();
    expect(FAKE_NATIVE_CONTACTS.updateContactAsync).toHaveBeenCalled();
    expect(FAKE_NATIVE_CONTACTS.removeContactAsync).toHaveBeenCalledWith('1');
  });

  it('writes a contact to a vCard file', async () => {
    expect(await writeContactToFileAsync({ id: '1' })).toBe(
      'file:///contact.vcf',
    );
  });
});

describe('groups and containers', () => {
  it('creates a group, falling back to a generated name and the default container', async () => {
    FAKE_NATIVE_CONTACTS.createGroupAsync.mockClear();
    await createGroupAsync();
    expect(FAKE_NATIVE_CONTACTS.createGroupAsync).toHaveBeenCalledWith(
      'generated-uuid',
      'default-container',
    );
  });

  it('creates a group with an explicit name and container', async () => {
    await createGroupAsync('Family', 'container-1');
    expect(FAKE_NATIVE_CONTACTS.createGroupAsync).toHaveBeenCalledWith(
      'Family',
      'container-1',
    );
  });

  it('resolves the default container id', async () => {
    expect(await getDefaultContainerIdAsync()).toBe('default-container');
  });

  it('lists groups and containers', async () => {
    expect(await getGroupsAsync({})).toHaveLength(1);
    expect(await getContainersAsync({})).toHaveLength(1);
  });
});

describe('permissions and listeners', () => {
  it('gets and requests permissions', async () => {
    await getPermissionsAsync();
    await requestPermissionsAsync();
    expect(FAKE_NATIVE_CONTACTS.getPermissionsAsync).toHaveBeenCalled();
    expect(FAKE_NATIVE_CONTACTS.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('adds a contacts-change listener', () => {
    const listener = vi.fn();
    addContactsChangeListener(listener);
    expect(FAKE_NATIVE_CONTACTS.addListener).toHaveBeenCalledWith(
      'onContactsChange',
      listener,
    );
  });
});

describe('absent native method guards', () => {
  it('throws UnavailabilityError when the native function is missing', async () => {
    const nativeContacts = FAKE_NATIVE_CONTACTS as {
      hasContactsAsync?: unknown;
    };
    const original = nativeContacts.hasContactsAsync;
    nativeContacts.hasContactsAsync = undefined;
    await expect(hasContactsAsync()).rejects.toThrow(/hasContactsAsync/);
    nativeContacts.hasContactsAsync = original;
  });
});
