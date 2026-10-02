import { useState } from 'react';
import {
  AndroidAudioContentType,
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationPriority,
  AndroidNotificationVisibility,
  deleteNotificationCategoryAsync,
  deleteNotificationChannelAsync,
  deleteNotificationChannelGroupAsync,
  getNotificationCategoriesAsync,
  getNotificationChannelAsync,
  getNotificationChannelGroupAsync,
  getNotificationChannelGroupsAsync,
  getNotificationChannelsAsync,
  setNotificationCategoryAsync,
  setNotificationChannelAsync,
  setNotificationChannelGroupAsync,
} from '@symbiote-native/notifications/react';
import { CallConsole } from '../components/CallConsole';
import { Card, ChoiceRow, Field, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);

function enumOptions(source: object): { label: string; value: number }[] {
  return Object.entries(source)
    .filter(([, value]) => typeof value === 'number')
    .map(([label, value]) => ({ label, value: Number(value) }));
}
const IMPORTANCES = enumOptions(AndroidImportance);
const VISIBILITIES = enumOptions(AndroidNotificationVisibility);
const USAGES = enumOptions(AndroidAudioUsage);
const CONTENT_TYPES = enumOptions(AndroidAudioContentType);

type IChannelForm = {
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
type ISetChannel = (patch: Partial<IChannelForm>) => void;

function ChannelFields({ form, setForm }: { form: IChannelForm; setForm: ISetChannel }) {
  return (
    <>
      <Field testID="notifications-channel-id-input" label="channel id" value={form.channelId} onChange={channelId => setForm({ channelId })} />
      <Field testID="notifications-channel-name-input" label="name" value={form.name} onChange={name => setForm({ name })} />
      <Field testID="notifications-channel-description-input" label="description" value={form.description} onChange={description => setForm({ description })} />
      <Field testID="notifications-channel-group-input" label="groupId" value={form.groupId} onChange={groupId => setForm({ groupId })} />
      <Field testID="notifications-channel-light-input" label="lightColor" value={form.lightColor} onChange={lightColor => setForm({ lightColor })} />
      <Field testID="notifications-channel-vibration-input" label="vibrationPattern (comma separated ms)" value={form.vibration} onChange={vibration => setForm({ vibration })} />
    </>
  );
}

function ChannelChoices({ form, setForm }: { form: IChannelForm; setForm: ISetChannel }) {
  return (
    <>
      <ChoiceRow testID="notifications-channel-importance" label="AndroidImportance" options={IMPORTANCES} value={form.importance} onChange={importance => setForm({ importance })} color={color} />
      <ChoiceRow testID="notifications-channel-visibility" label="lockscreenVisibility" options={VISIBILITIES} value={form.visibility} onChange={visibility => setForm({ visibility })} color={color} />
      <ChoiceRow testID="notifications-channel-usage" label="audioAttributes.usage" options={USAGES} value={form.usage} onChange={usage => setForm({ usage })} color={color} />
      <ChoiceRow testID="notifications-channel-content-type" label="audioAttributes.contentType" options={CONTENT_TYPES} value={form.contentType} onChange={contentType => setForm({ contentType })} color={color} />
      <ToggleRow testID="notifications-channel-bypass-switch" label="bypassDnd" value={form.isBypassDnd} onChange={isBypassDnd => setForm({ isBypassDnd })} color={color} />
      <ToggleRow testID="notifications-channel-badge-switch" label="showBadge" value={form.isBadge} onChange={isBadge => setForm({ isBadge })} color={color} />
      <ToggleRow testID="notifications-channel-lights-switch" label="enableLights" value={form.isLights} onChange={isLights => setForm({ isLights })} color={color} />
      <ToggleRow testID="notifications-channel-vibrate-switch" label="enableVibrate" value={form.isVibrate} onChange={isVibrate => setForm({ isVibrate })} color={color} />
      <ToggleRow testID="notifications-channel-sound-switch" label="sound default" value={form.isDefaultSound} onChange={isDefaultSound => setForm({ isDefaultSound })} color={color} />
    </>
  );
}

function ChannelCalls({ form }: { form: IChannelForm }) {
  return (
    <CallConsole
      prefix="notifications-channels"
      title="Channels and groups (Android)"
      color={color}
      calls={[
        {
          label: 'setNotificationChannelAsync',
          run: () =>
            setNotificationChannelAsync(form.channelId, {
              name: form.name,
              importance: form.importance,
              description: form.description,
              groupId: form.groupId === '' ? undefined : form.groupId,
              lightColor: form.lightColor,
              lockscreenVisibility: form.visibility,
              audioAttributes: { usage: form.usage, contentType: form.contentType },
              vibrationPattern: form.vibration === '' ? undefined : form.vibration.split(',').map(Number),
              bypassDnd: form.isBypassDnd,
              showBadge: form.isBadge,
              enableLights: form.isLights,
              enableVibrate: form.isVibrate,
              sound: form.isDefaultSound ? 'default' : null,
            }),
        },
        { label: 'getNotificationChannelsAsync', run: () => getNotificationChannelsAsync() },
        { label: 'getNotificationChannelAsync', run: () => getNotificationChannelAsync(form.channelId) },
        { label: 'deleteNotificationChannelAsync', run: () => deleteNotificationChannelAsync(form.channelId) },
        { label: 'setNotificationChannelGroupAsync', run: () => setNotificationChannelGroupAsync(form.groupId, { name: form.name, description: form.description }) },
        { label: 'getNotificationChannelGroupsAsync', run: () => getNotificationChannelGroupsAsync() },
        { label: 'getNotificationChannelGroupAsync', run: () => getNotificationChannelGroupAsync(form.groupId) },
        { label: 'deleteNotificationChannelGroupAsync', run: () => deleteNotificationChannelGroupAsync(form.groupId) },
        { label: 'AndroidNotificationPriority', run: async () => AndroidNotificationPriority },
      ]}
    />
  );
}

type ICategoryForm = {
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

function CategoryCard({ form, setForm }: { form: ICategoryForm; setForm: (patch: Partial<ICategoryForm>) => void }) {
  return (
    <Card testID="notifications-category-card" title="Category inputs">
      <Field testID="notifications-category-id-input" label="identifier" value={form.identifier} onChange={identifier => setForm({ identifier })} />
      <Field testID="notifications-action-id-input" label="action identifier" value={form.actionId} onChange={actionId => setForm({ actionId })} />
      <Field testID="notifications-button-title-input" label="buttonTitle" value={form.buttonTitle} onChange={buttonTitle => setForm({ buttonTitle })} />
      <ToggleRow testID="notifications-text-input-switch" label="textInput" value={form.isTextInput} onChange={isTextInput => setForm({ isTextInput })} color={color} />
      <Field testID="notifications-placeholder-input" label="textInput placeholder" value={form.placeholder} onChange={placeholder => setForm({ placeholder })} />
      <ToggleRow testID="notifications-destructive-switch" label="isDestructive" value={form.isDestructive} onChange={isDestructive => setForm({ isDestructive })} color={color} />
      <ToggleRow testID="notifications-authentication-switch" label="isAuthenticationRequired" value={form.isAuthentication} onChange={isAuthentication => setForm({ isAuthentication })} color={color} />
      <ToggleRow testID="notifications-foreground-switch" label="opensAppToForeground" value={form.isForeground} onChange={isForeground => setForm({ isForeground })} color={color} />
      <ToggleRow testID="notifications-dismiss-switch" label="customDismissAction (iOS)" value={form.isDismissAction} onChange={isDismissAction => setForm({ isDismissAction })} color={color} />
      <Field testID="notifications-preview-input" label="previewPlaceholder (iOS)" value={form.previewPlaceholder} onChange={previewPlaceholder => setForm({ previewPlaceholder })} />
    </Card>
  );
}

function CategoryCalls({ form }: { form: ICategoryForm }) {
  return (
    <CallConsole
      prefix="notifications-categories"
      title="Categories"
      color={color}
      calls={[
        {
          label: 'setNotificationCategoryAsync',
          run: () =>
            setNotificationCategoryAsync(
              form.identifier,
              [
                {
                  identifier: form.actionId,
                  buttonTitle: form.buttonTitle,
                  textInput: form.isTextInput ? { submitButtonTitle: 'Send', placeholder: form.placeholder } : undefined,
                  options: { isDestructive: form.isDestructive, isAuthenticationRequired: form.isAuthentication, opensAppToForeground: form.isForeground },
                },
              ],
              { previewPlaceholder: form.previewPlaceholder, customDismissAction: form.isDismissAction },
            ),
        },
        { label: 'getNotificationCategoriesAsync', run: () => getNotificationCategoriesAsync() },
        { label: 'deleteNotificationCategoryAsync', run: () => deleteNotificationCategoryAsync(form.identifier) },
      ]}
    />
  );
}

export function ChannelCards() {
  const [channel, setChannelState] = useState<IChannelForm>({
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
  });
  const [category, setCategoryState] = useState<ICategoryForm>({
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
  });
  const setChannel: ISetChannel = patch => setChannelState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <Card testID="notifications-channel-card" title="Channel inputs (Android)">
        <ChannelFields form={channel} setForm={setChannel} />
        <ChannelChoices form={channel} setForm={setChannel} />
      </Card>
      <ChannelCalls form={channel} />
      <CategoryCard form={category} setForm={patch => setCategoryState(previous => ({ ...previous, ...patch }))} />
      <CategoryCalls form={category} />
    </>
  );
}
