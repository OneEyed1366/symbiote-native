import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeNativeQuery {
  filters: unknown[] = [];
  eq(field: unknown, value: unknown) {
    this.filters.push(['eq', field, value]);
    return this;
  }
  within(field: unknown, value: unknown) {
    this.filters.push(['within', field, value]);
    return this;
  }
  gt(field: unknown, value: unknown) {
    this.filters.push(['gt', field, value]);
    return this;
  }
  gte(field: unknown, value: unknown) {
    this.filters.push(['gte', field, value]);
    return this;
  }
  lt(field: unknown, value: unknown) {
    this.filters.push(['lt', field, value]);
    return this;
  }
  lte(field: unknown, value: unknown) {
    this.filters.push(['lte', field, value]);
    return this;
  }
  limit(n: number) {
    this.filters.push(['limit', n]);
    return this;
  }
  offset(n: number) {
    this.filters.push(['offset', n]);
    return this;
  }
  orderBy(v: unknown) {
    this.filters.push(['orderBy', v]);
    return this;
  }
  album(v: unknown) {
    this.filters.push(['album', v]);
    return this;
  }
  async exe() {
    return [new FakeNativeAsset('asset-1')];
  }
  async exeForMetadata() {
    return [{ id: 'asset-1', filename: 'a.jpg' }];
  }
}

class FakeNativeAsset {
  constructor(public id: string) {}
  async getCreationTime() {
    return 1000;
  }
  async getDuration() {
    return null;
  }
  async getFilename() {
    return 'IMG_0001.jpg';
  }
  async getHeight() {
    return 200;
  }
  async getWidth() {
    return 100;
  }
  async getMediaType() {
    return 'image';
  }
  async getMediaSubtypes() {
    return ['livePhoto'];
  }
  async getLivePhotoVideoUri() {
    return 'file:///live.mov';
  }
  async getIsInCloud() {
    return false;
  }
  async getOrientation() {
    return 1;
  }
  async getModificationTime() {
    return 2000;
  }
  async getShape() {
    return { width: 100, height: 200 };
  }
  async getUri() {
    return 'file:///IMG_0001.jpg';
  }
  async getInfo() {
    return { id: this.id, filename: 'IMG_0001.jpg' };
  }
  async getAlbums() {
    return [new FakeNativeAlbum('album-1')];
  }
  async getLocation() {
    return null;
  }
  async getExif() {
    return {};
  }
  async delete() {
    return undefined;
  }
  async getFavorite() {
    return false;
  }
  async setFavorite() {
    return undefined;
  }
  static async create(filePath: string) {
    return new FakeNativeAsset(`created:${filePath}`);
  }
  static async delete() {
    return undefined;
  }
}

class FakeNativeAlbum {
  constructor(public id: string) {}
  async getAssets() {
    return [new FakeNativeAsset('asset-1')];
  }
  async getTitle() {
    return 'Camera';
  }
  async delete() {
    return undefined;
  }
  async add() {
    return undefined;
  }
  async removeAssets() {
    return undefined;
  }
  static async create(name: string) {
    return new FakeNativeAlbum(`created:${name}`);
  }
  static async delete() {
    return undefined;
  }
  static async get(title: string) {
    return title === 'missing' ? null : new FakeNativeAlbum('album-1');
  }
  static async getAll() {
    return [new FakeNativeAlbum('album-1')];
  }
}

const GRANTED_PERMISSION = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};

function createFakeNativeMediaLibraryNext() {
  const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
  return {
    Query: FakeNativeQuery,
    Asset: FakeNativeAsset,
    Album: FakeNativeAlbum,
    requestPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    getPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    presentPermissionsPicker: vi.fn(async () => undefined),
    addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
      listeners[eventName] = cb;
      return { remove: vi.fn() };
    }),
    removeAllListeners: vi.fn(),
    fireEvent(eventName: string, event: unknown) {
      listeners[eventName]?.(event);
    },
  };
}

const FAKE_NATIVE = createFakeNativeMediaLibraryNext();
const mockPlatform = { OS: 'ios' as 'ios' | 'android' };

vi.mock('./native-module', () => ({
  expoMediaLibraryNext: FAKE_NATIVE,
}));

vi.mock('expo-modules-core', () => ({
  createPermissionHook: () => () => {
    throw new Error('createPermissionHook stub — not exercised by these tests');
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${moduleName}.${propertyName} is not available on this platform.`);
      this.name = 'UnavailabilityError';
    }
  },
}));

vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

const {
  Query,
  Asset,
  Album,
  requestPermissionsAsync,
  getPermissionsAsync,
  presentPermissionsPicker,
  addListener,
  removeAllListeners,
} = await import('./index');

beforeEach(() => {
  mockPlatform.OS = 'ios';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Query', () => {
  it('chains filters and returns the same instance', () => {
    const query = new Query();
    const chained = query.eq('mediaType' as never, 'image' as never).limit(20);
    expect(chained).toBe(query);
  });

  it('exe() resolves the matching assets', async () => {
    const assets = await new Query().exe();
    expect(assets).toHaveLength(1);
    expect(assets[0]!.id).toBe('asset-1');
  });
});

describe('Asset', () => {
  it('passes platform-agnostic getters straight through', async () => {
    const asset = new Asset('asset-1');
    expect(await asset.getFilename()).toBe('IMG_0001.jpg');
    expect(await asset.getWidth()).toBe(100);
  });

  it('resolves getMediaSubtypes on iOS', async () => {
    mockPlatform.OS = 'ios';
    const asset = new Asset('asset-1');
    expect(await asset.getMediaSubtypes()).toEqual(['livePhoto']);
  });

  // Every override throws SYNCHRONOUSLY (matching upstream's own `Asset` override, which also
  // throws before returning a Promise) — `.rejects` only catches an async rejection, so calling
  // the method inside `expect()`'s argument crashes the test outright. Wrap in a closure instead.
  it('throws UnavailabilityError for getMediaSubtypes on Android', () => {
    mockPlatform.OS = 'android';
    const asset = new Asset('asset-1');
    expect(() => asset.getMediaSubtypes()).toThrow(
      /not available on this platform/,
    );
  });

  it('throws UnavailabilityError for getLivePhotoVideoUri on Android', () => {
    mockPlatform.OS = 'android';
    const asset = new Asset('asset-1');
    expect(() => asset.getLivePhotoVideoUri()).toThrow(
      /not available on this platform/,
    );
  });

  it('throws UnavailabilityError for getIsInCloud on Android', () => {
    mockPlatform.OS = 'android';
    const asset = new Asset('asset-1');
    expect(() => asset.getIsInCloud()).toThrow(
      /not available on this platform/,
    );
  });

  it('throws UnavailabilityError for getOrientation on Android', () => {
    mockPlatform.OS = 'android';
    const asset = new Asset('asset-1');
    expect(() => asset.getOrientation()).toThrow(
      /not available on this platform/,
    );
  });

  it('Asset.create resolves a created asset', async () => {
    const created = await Asset.create('file:///photo.jpg');
    expect(created.id).toBe('created:file:///photo.jpg');
  });
});

describe('Album', () => {
  it('getAssets/getTitle pass through', async () => {
    const album = new Album('album-1');
    expect(await album.getTitle()).toBe('Camera');
    expect(await album.getAssets()).toHaveLength(1);
  });

  it('Album.get resolves null when not found', async () => {
    expect(await Album.get('missing')).toBeNull();
  });

  it('Album.getAll resolves every album', async () => {
    expect(await Album.getAll()).toHaveLength(1);
  });
});

describe('permissions', () => {
  it('requestPermissionsAsync forwards granularPermissions on Android', async () => {
    mockPlatform.OS = 'android';
    await requestPermissionsAsync(false, ['photo']);
    expect(FAKE_NATIVE.requestPermissionsAsync).toHaveBeenCalledWith(false, [
      'photo',
    ]);
  });

  it('requestPermissionsAsync omits granularPermissions on iOS', async () => {
    mockPlatform.OS = 'ios';
    await requestPermissionsAsync(false, ['photo']);
    expect(FAKE_NATIVE.requestPermissionsAsync).toHaveBeenCalledWith(false);
  });

  it('getPermissionsAsync resolves the native response', async () => {
    const response = await getPermissionsAsync();
    expect(response).toEqual(GRANTED_PERMISSION);
  });

  it('presentPermissionsPicker forwards mediaTypes', async () => {
    await presentPermissionsPicker(['photo']);
    expect(FAKE_NATIVE.presentPermissionsPicker).toHaveBeenCalledWith([
      'photo',
    ]);
  });
});

describe('change events', () => {
  it('addListener wires up mediaLibraryDidChange and fires the callback', () => {
    const handler = vi.fn();
    addListener(handler);
    FAKE_NATIVE.fireEvent('mediaLibraryDidChange', {
      hasIncrementalChanges: false,
    });
    expect(handler).toHaveBeenCalledWith({ hasIncrementalChanges: false });
  });

  it('removeAllListeners calls through to the native module', () => {
    removeAllListeners();
    expect(FAKE_NATIVE.removeAllListeners).toHaveBeenCalledWith(
      'mediaLibraryDidChange',
    );
  });
});
