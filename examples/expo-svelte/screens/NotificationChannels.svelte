<script lang="ts">
  import {
    AndroidNotificationPriority,
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
  } from '@symbiote-native/notifications/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import {
    CONTENT_TYPES,
    IMPORTANCES,
    INITIAL_CATEGORY_FORM,
    INITIAL_CHANNEL_FORM,
    USAGES,
    VISIBILITIES,
  } from './notification-channel-form';
  import type { ICategoryForm, IChannelForm } from './notification-channel-form';

  const color = lineColorOf(ROUTE_NAME.Notifications);

  let channel = $state<IChannelForm>({ ...INITIAL_CHANNEL_FORM });
  let category = $state<ICategoryForm>({ ...INITIAL_CATEGORY_FORM });
</script>

<Card testID="notifications-channel-card" title="Channel inputs (Android)">
  <Field testID="notifications-channel-id-input" label="channel id" value={channel.channelId} onChange={channelId => (channel.channelId = channelId)} />
  <Field testID="notifications-channel-name-input" label="name" value={channel.name} onChange={name => (channel.name = name)} />
  <Field testID="notifications-channel-description-input" label="description" value={channel.description} onChange={description => (channel.description = description)} />
  <Field testID="notifications-channel-group-input" label="groupId" value={channel.groupId} onChange={groupId => (channel.groupId = groupId)} />
  <Field testID="notifications-channel-light-input" label="lightColor" value={channel.lightColor} onChange={lightColor => (channel.lightColor = lightColor)} />
  <Field testID="notifications-channel-vibration-input" label="vibrationPattern (comma separated ms)" value={channel.vibration} onChange={vibration => (channel.vibration = vibration)} />
  <ChoiceRow testID="notifications-channel-importance" label="AndroidImportance" options={IMPORTANCES} value={channel.importance} onChange={importance => (channel.importance = importance)} {color} />
  <ChoiceRow testID="notifications-channel-visibility" label="lockscreenVisibility" options={VISIBILITIES} value={channel.visibility} onChange={visibility => (channel.visibility = visibility)} {color} />
  <ChoiceRow testID="notifications-channel-usage" label="audioAttributes.usage" options={USAGES} value={channel.usage} onChange={usage => (channel.usage = usage)} {color} />
  <ChoiceRow testID="notifications-channel-content-type" label="audioAttributes.contentType" options={CONTENT_TYPES} value={channel.contentType} onChange={contentType => (channel.contentType = contentType)} {color} />
  <ToggleRow testID="notifications-channel-bypass-switch" label="bypassDnd" value={channel.isBypassDnd} onChange={isBypassDnd => (channel.isBypassDnd = isBypassDnd)} {color} />
  <ToggleRow testID="notifications-channel-badge-switch" label="showBadge" value={channel.isBadge} onChange={isBadge => (channel.isBadge = isBadge)} {color} />
  <ToggleRow testID="notifications-channel-lights-switch" label="enableLights" value={channel.isLights} onChange={isLights => (channel.isLights = isLights)} {color} />
  <ToggleRow testID="notifications-channel-vibrate-switch" label="enableVibrate" value={channel.isVibrate} onChange={isVibrate => (channel.isVibrate = isVibrate)} {color} />
  <ToggleRow testID="notifications-channel-sound-switch" label="sound default" value={channel.isDefaultSound} onChange={isDefaultSound => (channel.isDefaultSound = isDefaultSound)} {color} />
</Card>
<CallConsole
  prefix="notifications-channels"
  title="Channels and groups (Android)"
  {color}
  calls={[
    {
      label: 'setNotificationChannelAsync',
      run: () =>
        setNotificationChannelAsync(channel.channelId, {
          name: channel.name,
          importance: channel.importance,
          description: channel.description,
          groupId: channel.groupId === '' ? undefined : channel.groupId,
          lightColor: channel.lightColor,
          lockscreenVisibility: channel.visibility,
          audioAttributes: { usage: channel.usage, contentType: channel.contentType },
          vibrationPattern:
            channel.vibration === '' ? undefined : channel.vibration.split(',').map(Number),
          bypassDnd: channel.isBypassDnd,
          showBadge: channel.isBadge,
          enableLights: channel.isLights,
          enableVibrate: channel.isVibrate,
          sound: channel.isDefaultSound ? 'default' : null,
        }),
    },
    { label: 'getNotificationChannelsAsync', run: () => getNotificationChannelsAsync() },
    {
      label: 'getNotificationChannelAsync',
      run: () => getNotificationChannelAsync(channel.channelId),
    },
    {
      label: 'deleteNotificationChannelAsync',
      run: () => deleteNotificationChannelAsync(channel.channelId),
    },
    {
      label: 'setNotificationChannelGroupAsync',
      run: () =>
        setNotificationChannelGroupAsync(channel.groupId, {
          name: channel.name,
          description: channel.description,
        }),
    },
    {
      label: 'getNotificationChannelGroupsAsync',
      run: () => getNotificationChannelGroupsAsync(),
    },
    {
      label: 'getNotificationChannelGroupAsync',
      run: () => getNotificationChannelGroupAsync(channel.groupId),
    },
    {
      label: 'deleteNotificationChannelGroupAsync',
      run: () => deleteNotificationChannelGroupAsync(channel.groupId),
    },
    { label: 'AndroidNotificationPriority', run: async () => AndroidNotificationPriority },
  ]}
/>
<Card testID="notifications-category-card" title="Category inputs">
  <Field testID="notifications-category-id-input" label="identifier" value={category.identifier} onChange={identifier => (category.identifier = identifier)} />
  <Field testID="notifications-action-id-input" label="action identifier" value={category.actionId} onChange={actionId => (category.actionId = actionId)} />
  <Field testID="notifications-button-title-input" label="buttonTitle" value={category.buttonTitle} onChange={buttonTitle => (category.buttonTitle = buttonTitle)} />
  <ToggleRow testID="notifications-text-input-switch" label="textInput" value={category.isTextInput} onChange={isTextInput => (category.isTextInput = isTextInput)} {color} />
  <Field testID="notifications-placeholder-input" label="textInput placeholder" value={category.placeholder} onChange={placeholder => (category.placeholder = placeholder)} />
  <ToggleRow testID="notifications-destructive-switch" label="isDestructive" value={category.isDestructive} onChange={isDestructive => (category.isDestructive = isDestructive)} {color} />
  <ToggleRow testID="notifications-authentication-switch" label="isAuthenticationRequired" value={category.isAuthentication} onChange={isAuthentication => (category.isAuthentication = isAuthentication)} {color} />
  <ToggleRow testID="notifications-foreground-switch" label="opensAppToForeground" value={category.isForeground} onChange={isForeground => (category.isForeground = isForeground)} {color} />
  <ToggleRow testID="notifications-dismiss-switch" label="customDismissAction (iOS)" value={category.isDismissAction} onChange={isDismissAction => (category.isDismissAction = isDismissAction)} {color} />
  <Field testID="notifications-preview-input" label="previewPlaceholder (iOS)" value={category.previewPlaceholder} onChange={previewPlaceholder => (category.previewPlaceholder = previewPlaceholder)} />
</Card>
<CallConsole
  prefix="notifications-categories"
  title="Categories"
  {color}
  calls={[
    {
      label: 'setNotificationCategoryAsync',
      run: () =>
        setNotificationCategoryAsync(
          category.identifier,
          [
            {
              identifier: category.actionId,
              buttonTitle: category.buttonTitle,
              textInput: category.isTextInput
                ? { submitButtonTitle: 'Send', placeholder: category.placeholder }
                : undefined,
              options: {
                isDestructive: category.isDestructive,
                isAuthenticationRequired: category.isAuthentication,
                opensAppToForeground: category.isForeground,
              },
            },
          ],
          {
            previewPlaceholder: category.previewPlaceholder,
            customDismissAction: category.isDismissAction,
          },
        ),
    },
    { label: 'getNotificationCategoriesAsync', run: () => getNotificationCategoriesAsync() },
    {
      label: 'deleteNotificationCategoryAsync',
      run: () => deleteNotificationCategoryAsync(category.identifier),
    },
  ]}
/>
