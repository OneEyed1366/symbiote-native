import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationVisibility,
} from '@symbiote-native/notifications/svelte';

function enumOptions(source: object): { label: string; value: number }[] {
  return Object.entries(source)
    .filter(([, value]) => typeof value === 'number')
    .map(([label, value]) => ({ label, value: Number(value) }));
}
export const IMPORTANCES = enumOptions(AndroidImportance);
export const VISIBILITIES = enumOptions(AndroidNotificationVisibility);
export const USAGES = enumOptions(AndroidAudioUsage);
export const CONTENT_TYPES = enumOptions(AndroidAudioContentType);

export type IChannelForm = {
  channelId: string;
  name: string;
  description: string;
  groupId: string;
  importance: number;
  visibility: number;
  usage: number;
  contentType: number;
  lightColor: string;
  vibration: string;
  isBypassDnd: boolean;
  isBadge: boolean;
  isLights: boolean;
  isVibrate: boolean;
  isDefaultSound: boolean;
};

export const INITIAL_CHANNEL_FORM: IChannelForm = {
  channelId: 'symbiote-canary-demo-channel',
  name: 'Canary demo',
  description: 'Channel created from the example app',
  groupId: 'symbiote-canary-group',
  importance: AndroidImportance.HIGH,
  visibility: AndroidNotificationVisibility.PUBLIC,
  usage: AndroidAudioUsage.NOTIFICATION,
  contentType: AndroidAudioContentType.SONIFICATION,
  lightColor: '#FF231F7C',
  vibration: '0,250,250,250',
  isBypassDnd: false,
  isBadge: true,
  isLights: true,
  isVibrate: true,
  isDefaultSound: true,
};

export type ICategoryForm = {
  identifier: string;
  actionId: string;
  buttonTitle: string;
  placeholder: string;
  isTextInput: boolean;
  isDestructive: boolean;
  isAuthentication: boolean;
  isForeground: boolean;
  isDismissAction: boolean;
  previewPlaceholder: string;
};

export const INITIAL_CATEGORY_FORM: ICategoryForm = {
  identifier: 'symbiote-canary-category',
  actionId: 'reply',
  buttonTitle: 'Reply',
  placeholder: 'Type a reply',
  isTextInput: true,
  isDestructive: false,
  isAuthentication: false,
  isForeground: true,
  isDismissAction: true,
  previewPlaceholder: 'New canary message',
};
