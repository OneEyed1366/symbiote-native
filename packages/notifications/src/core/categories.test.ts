import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_CATEGORIES_MODULE = {
  getNotificationCategoriesAsync: vi.fn(),
  setNotificationCategoryAsync: vi.fn(),
  deleteNotificationCategoryAsync: vi.fn(),
};

vi.mock('./native-modules', () => ({
  notificationCategoriesModule: FAKE_CATEGORIES_MODULE,
}));

vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  deleteNotificationCategoryAsync,
  getNotificationCategoriesAsync,
  setNotificationCategoryAsync,
} = await import('./categories');

afterEach(() => {
  vi.clearAllMocks();
});

// Ported from expo-notifications' NotificationCategories-test.ts.
describe('setNotificationCategoryAsync', () => {
  it('accepts the expected arguments', async () => {
    await setNotificationCategoryAsync(
      'my-category-id',
      [
        {
          identifier: 'actionId',
          buttonTitle: 'click me',
          textInput: {
            submitButtonTitle: 'submit',
            placeholder: 'tests are good',
          },
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: true,
            isDestructive: true,
          },
        },
      ],
      {
        previewPlaceholder: 'this is just a placeholder',
        intentIdentifiers: ['myIntentIdentifier'],
        categorySummaryFormat: 'formatString',
        customDismissAction: true,
        allowInCarPlay: true,
        showTitle: true,
        showSubtitle: true,
        allowAnnouncement: true,
      },
    );

    expect(
      FAKE_CATEGORIES_MODULE.setNotificationCategoryAsync,
    ).toHaveBeenLastCalledWith(
      'my-category-id',
      [
        {
          identifier: 'actionId',
          buttonTitle: 'click me',
          textInput: {
            submitButtonTitle: 'submit',
            placeholder: 'tests are good',
          },
          options: {
            opensAppToForeground: false,
            isAuthenticationRequired: true,
            isDestructive: true,
          },
        },
      ],
      {
        previewPlaceholder: 'this is just a placeholder',
        intentIdentifiers: ['myIntentIdentifier'],
        categorySummaryFormat: 'formatString',
        customDismissAction: true,
        allowInCarPlay: true,
        showTitle: true,
        showSubtitle: true,
        allowAnnouncement: true,
      },
    );
  });

  it('throws UnavailabilityError when native lacks the method', async () => {
    const original = FAKE_CATEGORIES_MODULE.setNotificationCategoryAsync;
    // @ts-expect-error — simulate a platform where the native module omits this method
    FAKE_CATEGORIES_MODULE.setNotificationCategoryAsync = undefined;

    await expect(setNotificationCategoryAsync('id', [])).rejects.toThrow(
      /not available/,
    );

    FAKE_CATEGORIES_MODULE.setNotificationCategoryAsync = original;
  });
});

describe('deleteNotificationCategoryAsync', () => {
  it('accepts the expected argument', async () => {
    await deleteNotificationCategoryAsync('my-category-id');
    expect(
      FAKE_CATEGORIES_MODULE.deleteNotificationCategoryAsync,
    ).toHaveBeenLastCalledWith('my-category-id');
  });
});

describe('getNotificationCategoriesAsync', () => {
  it('accepts the expected argument', async () => {
    await getNotificationCategoriesAsync();
    expect(
      FAKE_CATEGORIES_MODULE.getNotificationCategoriesAsync,
    ).toHaveBeenLastCalledWith();
  });
});
