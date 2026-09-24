import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IMediaLibraryAlbum,
  IMediaLibraryAsset,
  IMediaLibraryAssetInfo,
} from './types';

const ASSET: IMediaLibraryAsset = {
  id: 'asset-1',
  filename: 'IMG_0001.jpg',
  uri: 'file:///DCIM/IMG_0001.jpg',
  mediaType: 'photo',
  width: 100,
  height: 200,
  creationTime: 1,
  modificationTime: 2,
  duration: 0,
};

const ALBUM: IMediaLibraryAlbum = {
  id: 'album-1',
  title: 'Camera',
  assetCount: 3,
  startTime: 0,
  endTime: 0,
};

const GRANTED_PERMISSION = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};

// A tiny fake native module — addListener captures the listener per event name so a test can
// fire it directly, mirroring how native invokes the media-library change subscription.
function createFakeNativeMediaLibrary() {
  const listeners: Record<string, ((event: unknown) => void) | undefined> = {};
  return {
    MediaType: {
      audio: 'audio',
      photo: 'photo',
      video: 'video',
      unknown: 'unknown',
    },
    SortBy: {
      default: 'default',
      mediaType: 'mediaType',
      width: 'width',
      height: 'height',
      creationTime: 'creationTime',
      modificationTime: 'modificationTime',
      duration: 'duration',
    },
    CHANGE_LISTENER_NAME: 'Expo.MediaLibraryDidChange',
    addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
      listeners[eventName] = cb;
      return { remove: vi.fn() };
    }),
    removeAllListeners: vi.fn(),
    requestPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    getPermissionsAsync: vi.fn(async () => GRANTED_PERMISSION),
    presentPermissionsPickerAsync: vi.fn(async () => undefined),
    createAssetAsync: vi.fn(
      async (): Promise<IMediaLibraryAsset | IMediaLibraryAsset[]> => ASSET,
    ),
    saveToLibraryAsync: vi.fn(async () => undefined),
    addAssetsToAlbumAsync: vi.fn(async () => true),
    removeAssetsFromAlbumAsync: vi.fn(async () => true),
    deleteAssetsAsync: vi.fn(async () => true),
    getAssetInfoAsync: vi.fn(
      async (): Promise<IMediaLibraryAssetInfo | IMediaLibraryAssetInfo[]> => ({
        ...ASSET,
        localUri: ASSET.uri,
      }),
    ),
    getAssetContentUriAsync: vi.fn(
      async () => 'content://media/external/images/media/1',
    ),
    getAlbumsAsync: vi.fn(async () => [ALBUM]),
    getAlbumAsync: vi.fn(async () => ALBUM),
    createAlbumAsync: vi.fn(async () => ALBUM),
    deleteAlbumsAsync: vi.fn(async () => true),
    getAssetsAsync: vi.fn(async (options: Record<string, unknown>) => ({
      assets: [ASSET],
      endCursor: '1',
      hasNextPage: false,
      totalCount: 1,
      // Test-only echo so a test can assert what reached the native call.
      __options: options,
    })),
    getMomentsAsync: vi.fn(async () => [ALBUM]),
    migrateAlbumIfNeededAsync: vi.fn(async () => undefined),
    albumNeedsMigrationAsync: vi.fn(async () => false),
    setAssetFavoriteAsync: vi.fn(async () => true),
    // Test-only escape hatch to simulate native firing a subscribed event.
    fireEvent(eventName: string, event: unknown) {
      listeners[eventName]?.(event);
    },
  };
}

const FAKE_NATIVE_MEDIA_LIBRARY = createFakeNativeMediaLibrary();
const mockPlatform = { OS: 'ios' as 'ios' | 'android', Version: 30 };

// The real ExpoMediaLibrary native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, same pattern
// packages/location/src/core/location.test.ts uses.
vi.mock('./native-module', () => ({
  expoMediaLibrary: FAKE_NATIVE_MEDIA_LIBRARY,
}));

// expo-modules-core's real entry transitively imports 'react-native' for
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse.
vi.mock('expo-modules-core', () => ({
  createPermissionHook: () => () => {
    throw new Error('createPermissionHook stub — not exercised by these tests');
  },
}));

// media-library.ts reads Platform.Version, which only 'react-native' declares (not
// expo-modules-core's own trimmed Platform type) — same reasoning as packages/system-ui.
vi.mock('react-native', () => ({
  Platform: mockPlatform,
}));

const {
  isAvailableAsync,
  requestPermissionsAsync,
  getPermissionsAsync,
  presentPermissionsPickerAsync,
  createAssetAsync,
  saveToLibraryAsync,
  addAssetsToAlbumAsync,
  removeAssetsFromAlbumAsync,
  deleteAssetsAsync,
  getAssetInfoAsync,
  getAssetContentUriAsync,
  getAlbumsAsync,
  getAlbumAsync,
  createAlbumAsync,
  deleteAlbumsAsync,
  getAssetsAsync,
  addListener,
  removeAllListeners,
  getMomentsAsync,
  migrateAlbumIfNeededAsync,
  albumNeedsMigrationAsync,
  setAssetFavoriteAsync,
} = await import('./media-library');

beforeEach(() => {
  mockPlatform.OS = 'ios';
  mockPlatform.Version = 30;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  it('reports the native module as available', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });
});

describe('requestPermissionsAsync / getPermissionsAsync', () => {
  it('does not forward granularPermissions on iOS', async () => {
    await requestPermissionsAsync(false, ['photo']);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.requestPermissionsAsync,
    ).toHaveBeenCalledWith(false);
  });

  it('forwards granularPermissions on Android', async () => {
    mockPlatform.OS = 'android';
    await getPermissionsAsync(true, ['photo', 'video']);
    expect(FAKE_NATIVE_MEDIA_LIBRARY.getPermissionsAsync).toHaveBeenCalledWith(
      true,
      ['photo', 'video'],
    );
  });
});

describe('presentPermissionsPickerAsync', () => {
  it('requests granular permissions instead on Android 34+', async () => {
    mockPlatform.OS = 'android';
    mockPlatform.Version = 34;
    await presentPermissionsPickerAsync(['photo']);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.requestPermissionsAsync,
    ).toHaveBeenCalledWith(false, ['photo']);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.presentPermissionsPickerAsync,
    ).not.toHaveBeenCalled();
  });

  it('calls the native picker on iOS', async () => {
    await presentPermissionsPickerAsync();
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.presentPermissionsPickerAsync,
    ).toHaveBeenCalledTimes(1);
  });
});

describe('createAssetAsync', () => {
  it('rejects a non-string localUri', async () => {
    // @ts-expect-error — deliberately wrong input to prove the runtime guard fires
    await expect(createAssetAsync(42)).rejects.toThrow(
      /Invalid argument "localUri"/,
    );
  });

  it('rejects an empty-string URI', async () => {
    // why: an empty string is falsy, so it hits the same guard as a non-string value — upstream's
    // own test exercises exactly this input (MediaLibrary-test.native.ts).
    await expect(createAssetAsync('')).rejects.toThrow(
      /Invalid argument "localUri"/,
    );
    expect(FAKE_NATIVE_MEDIA_LIBRARY.createAssetAsync).not.toHaveBeenCalled();
  });

  it('unwraps an Android-style array response', async () => {
    FAKE_NATIVE_MEDIA_LIBRARY.createAssetAsync.mockResolvedValueOnce([ASSET]);
    await expect(createAssetAsync('file:///a.jpg')).resolves.toEqual(ASSET);
  });
});

describe('saveToLibraryAsync', () => {
  it('forwards the local URI', async () => {
    await saveToLibraryAsync('file:///a.jpg');
    expect(FAKE_NATIVE_MEDIA_LIBRARY.saveToLibraryAsync).toHaveBeenCalledWith(
      'file:///a.jpg',
    );
  });
});

describe('addAssetsToAlbumAsync', () => {
  it('rejects a non-string asset ID', async () => {
    await expect(
      addAssetsToAlbumAsync([{ id: '' } as never], ALBUM),
    ).rejects.toThrow(/Asset ID must be a string/);
  });

  it('omits the copy flag on iOS', async () => {
    await addAssetsToAlbumAsync([ASSET], ALBUM, false);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.addAssetsToAlbumAsync,
    ).toHaveBeenCalledWith([ASSET.id], ALBUM.id);
  });

  it('forwards the copy flag on Android', async () => {
    mockPlatform.OS = 'android';
    await addAssetsToAlbumAsync([ASSET], ALBUM, false);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.addAssetsToAlbumAsync,
    ).toHaveBeenCalledWith([ASSET.id], ALBUM.id, false);
  });
});

describe('removeAssetsFromAlbumAsync / deleteAssetsAsync', () => {
  it('removes assets from an album', async () => {
    await expect(removeAssetsFromAlbumAsync(ASSET, ALBUM)).resolves.toBe(true);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.removeAssetsFromAlbumAsync,
    ).toHaveBeenCalledWith([ASSET.id], ALBUM.id);
  });

  it('deletes assets outright', async () => {
    await expect(deleteAssetsAsync(ASSET)).resolves.toBe(true);
    expect(FAKE_NATIVE_MEDIA_LIBRARY.deleteAssetsAsync).toHaveBeenCalledWith([
      ASSET.id,
    ]);
  });
});

describe('getAssetInfoAsync', () => {
  it('unwraps an Android-style array response', async () => {
    FAKE_NATIVE_MEDIA_LIBRARY.getAssetInfoAsync.mockResolvedValueOnce([
      { ...ASSET, localUri: ASSET.uri },
    ]);
    await expect(getAssetInfoAsync(ASSET)).resolves.toMatchObject({
      id: ASSET.id,
    });
  });
});

describe('getAssetContentUriAsync', () => {
  it('is Android-only', async () => {
    await expect(getAssetContentUriAsync(ASSET)).rejects.toThrow(
      /only available on Android/,
    );
  });

  it('resolves on Android', async () => {
    mockPlatform.OS = 'android';
    await expect(getAssetContentUriAsync(ASSET)).resolves.toBe(
      'content://media/external/images/media/1',
    );
  });
});

describe('albums', () => {
  it('lists albums', async () => {
    await expect(getAlbumsAsync()).resolves.toEqual([ALBUM]);
  });

  it('rejects a non-string title', async () => {
    // @ts-expect-error — deliberately wrong input to prove the runtime guard fires
    await expect(getAlbumAsync(42)).rejects.toThrow(
      /Album title must be a string/,
    );
  });

  it('createAlbumAsync requires an asset or localUri on Android', async () => {
    mockPlatform.OS = 'android';
    await expect(createAlbumAsync('New Album')).rejects.toThrow(
      /must be called with an asset or a localUri on Android/,
    );
  });

  it('createAlbumAsync omits copyAsset on iOS', async () => {
    await createAlbumAsync('New Album', ASSET, false, undefined);
    expect(FAKE_NATIVE_MEDIA_LIBRARY.createAlbumAsync).toHaveBeenCalledWith(
      'New Album',
      ASSET.id,
      undefined,
    );
  });

  it('deleteAlbumsAsync omits deleteAssets on Android', async () => {
    mockPlatform.OS = 'android';
    await deleteAlbumsAsync(ALBUM, true);
    expect(FAKE_NATIVE_MEDIA_LIBRARY.deleteAlbumsAsync).toHaveBeenCalledWith([
      ALBUM.id,
    ]);
  });

  it('deleteAlbumsAsync forwards deleteAssets on iOS', async () => {
    await deleteAlbumsAsync(ALBUM, true);
    expect(FAKE_NATIVE_MEDIA_LIBRARY.deleteAlbumsAsync).toHaveBeenCalledWith(
      [ALBUM.id],
      true,
    );
  });
});

describe('getAssetsAsync', () => {
  it('rejects a negative "first"', async () => {
    await expect(getAssetsAsync({ first: -1 })).rejects.toThrow(
      /"first" must be a positive integer/,
    );
  });

  it('defaults first to 20 and mediaType to photo', async () => {
    const page = await getAssetsAsync();
    const options = (page as unknown as { __options: Record<string, unknown> })
      .__options;
    expect(options.first).toBe(20);
    expect(options.mediaType).toEqual(['photo']);
  });

  it('encodes sortBy as "<key> ASC/DESC" — a single [key, asc] pair must be double-nested', async () => {
    // arrayize() passes any array through unchanged, so a bare [key, bool] tuple reads as
    // two separate sortBy values rather than one — matching expo-media-library's own
    // legacy/MediaLibrary.ts (verified against .vendors/expo at origin/sdk-57).
    const page = await getAssetsAsync({ sortBy: [['creationTime', true]] });
    const options = (page as unknown as { __options: Record<string, unknown> })
      .__options;
    expect(options.sortBy).toEqual(['creationTime ASC']);
  });

  it('a bare [key, asc] tuple is misread as two independent sortBy keys — upstream parity', async () => {
    await expect(
      getAssetsAsync({ sortBy: ['creationTime', true] as never }),
    ).rejects.toThrow(/Invalid sortBy key: true/);
  });
});

describe('addListener / removeAllListeners', () => {
  it('delivers a fired change event to the listener', () => {
    const listener = vi.fn();
    addListener(listener);
    const event = { hasIncrementalChanges: false };
    FAKE_NATIVE_MEDIA_LIBRARY.fireEvent('Expo.MediaLibraryDidChange', event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('removes all listeners for the change event name', () => {
    removeAllListeners();
    expect(FAKE_NATIVE_MEDIA_LIBRARY.removeAllListeners).toHaveBeenCalledWith(
      'Expo.MediaLibraryDidChange',
    );
  });
});

describe('getMomentsAsync', () => {
  it('returns moment albums', async () => {
    await expect(getMomentsAsync()).resolves.toEqual([ALBUM]);
  });
});

describe('migration helpers', () => {
  it('migrateAlbumIfNeededAsync forwards the album ID', async () => {
    await migrateAlbumIfNeededAsync(ALBUM);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.migrateAlbumIfNeededAsync,
    ).toHaveBeenCalledWith(ALBUM.id);
  });

  it('albumNeedsMigrationAsync forwards the album ID', async () => {
    await expect(albumNeedsMigrationAsync(ALBUM)).resolves.toBe(false);
  });
});

describe('setAssetFavoriteAsync', () => {
  it('is iOS-only', async () => {
    mockPlatform.OS = 'android';
    await expect(setAssetFavoriteAsync(ASSET, true)).rejects.toThrow(
      /only available on iOS/,
    );
  });

  it('resolves on iOS', async () => {
    await expect(setAssetFavoriteAsync(ASSET, true)).resolves.toBe(true);
    expect(
      FAKE_NATIVE_MEDIA_LIBRARY.setAssetFavoriteAsync,
    ).toHaveBeenCalledWith(ASSET.id, true);
  });
});
