import { createSignal } from 'solid-js';
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
} from '@symbiote-native/notifications/solid';
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

function ChannelFields(props: { form: IChannelForm; setForm: ISetChannel }) {
  return (
    <>
      <Field testID="notifications-channel-id-input" label="channel id" value={props.form.channelId} onChange={channelId => props.setForm({ channelId })} />
      <Field testID="notifications-channel-name-input" label="name" value={props.form.name} onChange={name => props.setForm({ name })} />
      <Field testID="notifications-channel-description-input" label="description" value={props.form.description} onChange={description => props.setForm({ description })} />
      <Field testID="notifications-channel-group-input" label="groupId" value={props.form.groupId} onChange={groupId => props.setForm({ groupId })} />
      <Field testID="notifications-channel-light-input" label="lightColor" value={props.form.lightColor} onChange={lightColor => props.setForm({ lightColor })} />
      <Field testID="notifications-channel-vibration-input" label="vibrationPattern (comma separated ms)" value={props.form.vibration} onChange={vibration => props.setForm({ vibration })} />
    </>
  );
}

function ChannelChoices(props: { form: IChannelForm; setForm: ISetChannel }) {
  return (
    <>
      <ChoiceRow testID="notifications-channel-importance" label="AndroidImportance" options={IMPORTANCES} value={props.form.importance} onChange={importance => props.setForm({ importance })} color={color} />
      <ChoiceRow testID="notifications-channel-visibility" label="lockscreenVisibility" options={VISIBILITIES} value={props.form.visibility} onChange={visibility => props.setForm({ visibility })} color={color} />
      <ChoiceRow testID="notifications-channel-usage" label="audioAttributes.usage" options={USAGES} value={props.form.usage} onChange={usage => props.setForm({ usage })} color={color} />
      <ChoiceRow testID="notifications-channel-content-type" label="audioAttributes.contentType" options={CONTENT_TYPES} value={props.form.contentType} onChange={contentType => props.setForm({ contentType })} color={color} />
      <ToggleRow testID="notifications-channel-bypass-switch" label="bypassDnd" value={props.form.isBypassDnd} onChange={isBypassDnd => props.setForm({ isBypassDnd })} color={color} />
      <ToggleRow testID="notifications-channel-badge-switch" label="showBadge" value={props.form.isBadge} onChange={isBadge => props.setForm({ isBadge })} color={color} />
      <ToggleRow testID="notifications-channel-lights-switch" label="enableLights" value={props.form.isLights} onChange={isLights => props.setForm({ isLights })} color={color} />
      <ToggleRow testID="notifications-channel-vibrate-switch" label="enableVibrate" value={props.form.isVibrate} onChange={isVibrate => props.setForm({ isVibrate })} color={color} />
      <ToggleRow testID="notifications-channel-sound-switch" label="sound default" value={props.form.isDefaultSound} onChange={isDefaultSound => props.setForm({ isDefaultSound })} color={color} />
    </>
  );
}

function ChannelCalls(props: { form: IChannelForm }) {
  return (
    <CallConsole
      prefix="notifications-channels"
      title="Channels and groups (Android)"
      color={color}
      calls={[
        {
          label: 'setNotificationChannelAsync',
          run: () =>
            setNotificationChannelAsync(props.form.channelId, {
              name: props.form.name,
              importance: props.form.importance,
              description: props.form.description,
              groupId: props.form.groupId === '' ? undefined : props.form.groupId,
              lightColor: props.form.lightColor,
              lockscreenVisibility: props.form.visibility,
              audioAttributes: { usage: props.form.usage, contentType: props.form.contentType },
              vibrationPattern: props.form.vibration === '' ? undefined : props.form.vibration.split(',').map(Number),
              bypassDnd: props.form.isBypassDnd,
              showBadge: props.form.isBadge,
              enableLights: props.form.isLights,
              enableVibrate: props.form.isVibrate,
              sound: props.form.isDefaultSound ? 'default' : null,
            }),
        },
        { label: 'getNotificationChannelsAsync', run: () => getNotificationChannelsAsync() },
        { label: 'getNotificationChannelAsync', run: () => getNotificationChannelAsync(props.form.channelId) },
        { label: 'deleteNotificationChannelAsync', run: () => deleteNotificationChannelAsync(props.form.channelId) },
        { label: 'setNotificationChannelGroupAsync', run: () => setNotificationChannelGroupAsync(props.form.groupId, { name: props.form.name, description: props.form.description }) },
        { label: 'getNotificationChannelGroupsAsync', run: () => getNotificationChannelGroupsAsync() },
        { label: 'getNotificationChannelGroupAsync', run: () => getNotificationChannelGroupAsync(props.form.groupId) },
        { label: 'deleteNotificationChannelGroupAsync', run: () => deleteNotificationChannelGroupAsync(props.form.groupId) },
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

function CategoryCard(props: { form: ICategoryForm; setForm: (patch: Partial<ICategoryForm>) => void }) {
  return (
    <Card testID="notifications-category-card" title="Category inputs">
      <Field testID="notifications-category-id-input" label="identifier" value={props.form.identifier} onChange={identifier => props.setForm({ identifier })} />
      <Field testID="notifications-action-id-input" label="action identifier" value={props.form.actionId} onChange={actionId => props.setForm({ actionId })} />
      <Field testID="notifications-button-title-input" label="buttonTitle" value={props.form.buttonTitle} onChange={buttonTitle => props.setForm({ buttonTitle })} />
      <ToggleRow testID="notifications-text-input-switch" label="textInput" value={props.form.isTextInput} onChange={isTextInput => props.setForm({ isTextInput })} color={color} />
      <Field testID="notifications-placeholder-input" label="textInput placeholder" value={props.form.placeholder} onChange={placeholder => props.setForm({ placeholder })} />
      <ToggleRow testID="notifications-destructive-switch" label="isDestructive" value={props.form.isDestructive} onChange={isDestructive => props.setForm({ isDestructive })} color={color} />
      <ToggleRow testID="notifications-authentication-switch" label="isAuthenticationRequired" value={props.form.isAuthentication} onChange={isAuthentication => props.setForm({ isAuthentication })} color={color} />
      <ToggleRow testID="notifications-foreground-switch" label="opensAppToForeground" value={props.form.isForeground} onChange={isForeground => props.setForm({ isForeground })} color={color} />
      <ToggleRow testID="notifications-dismiss-switch" label="customDismissAction (iOS)" value={props.form.isDismissAction} onChange={isDismissAction => props.setForm({ isDismissAction })} color={color} />
      <Field testID="notifications-preview-input" label="previewPlaceholder (iOS)" value={props.form.previewPlaceholder} onChange={previewPlaceholder => props.setForm({ previewPlaceholder })} />
    </Card>
  );
}

function CategoryCalls(props: { form: ICategoryForm }) {
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
              props.form.identifier,
              [
                {
                  identifier: props.form.actionId,
                  buttonTitle: props.form.buttonTitle,
                  textInput: props.form.isTextInput ? { submitButtonTitle: 'Send', placeholder: props.form.placeholder } : undefined,
                  options: { isDestructive: props.form.isDestructive, isAuthenticationRequired: props.form.isAuthentication, opensAppToForeground: props.form.isForeground },
                },
              ],
              { previewPlaceholder: props.form.previewPlaceholder, customDismissAction: props.form.isDismissAction },
            ),
        },
        { label: 'getNotificationCategoriesAsync', run: () => getNotificationCategoriesAsync() },
        { label: 'deleteNotificationCategoryAsync', run: () => deleteNotificationCategoryAsync(props.form.identifier) },
      ]}
    />
  );
}

export function ChannelCards() {
  const [channel, setChannelState] = createSignal<IChannelForm>({
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
  const [category, setCategoryState] = createSignal<ICategoryForm>({
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
        <ChannelFields form={channel()} setForm={setChannel} />
        <ChannelChoices form={channel()} setForm={setChannel} />
      </Card>
      <ChannelCalls form={channel()} />
      <CategoryCard form={category()} setForm={patch => setCategoryState(previous => ({ ...previous, ...patch }))} />
      <CategoryCalls form={category()} />
    </>
  );
}
