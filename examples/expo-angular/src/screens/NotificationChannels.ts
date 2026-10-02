import { Component, signal } from '@angular/core';
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
} from '@symbiote-native/notifications/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
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

@Component({
  selector: 'NotificationChannels',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card testID="notifications-channel-card" title="Channel inputs (Android)">
      <Field
        testID="notifications-channel-id-input"
        label="channel id"
        [value]="channel().channelId"
        (valueChange)="patchChannel({ channelId: $event })"
      />
      <Field
        testID="notifications-channel-name-input"
        label="name"
        [value]="channel().name"
        (valueChange)="patchChannel({ name: $event })"
      />
      <Field
        testID="notifications-channel-description-input"
        label="description"
        [value]="channel().description"
        (valueChange)="patchChannel({ description: $event })"
      />
      <Field
        testID="notifications-channel-group-input"
        label="groupId"
        [value]="channel().groupId"
        (valueChange)="patchChannel({ groupId: $event })"
      />
      <Field
        testID="notifications-channel-light-input"
        label="lightColor"
        [value]="channel().lightColor"
        (valueChange)="patchChannel({ lightColor: $event })"
      />
      <Field
        testID="notifications-channel-vibration-input"
        label="vibrationPattern (comma separated ms)"
        [value]="channel().vibration"
        (valueChange)="patchChannel({ vibration: $event })"
      />
      <ChoiceRow
        testID="notifications-channel-importance"
        label="AndroidImportance"
        [options]="importances"
        [value]="channel().importance"
        (valueChange)="patchChannel({ importance: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="notifications-channel-visibility"
        label="lockscreenVisibility"
        [options]="visibilities"
        [value]="channel().visibility"
        (valueChange)="patchChannel({ visibility: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="notifications-channel-usage"
        label="audioAttributes.usage"
        [options]="usages"
        [value]="channel().usage"
        (valueChange)="patchChannel({ usage: $event })"
        [color]="color"
      />
      <ChoiceRow
        testID="notifications-channel-content-type"
        label="audioAttributes.contentType"
        [options]="contentTypes"
        [value]="channel().contentType"
        (valueChange)="patchChannel({ contentType: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-channel-bypass-switch"
        label="bypassDnd"
        [value]="channel().isBypassDnd"
        (valueChange)="patchChannel({ isBypassDnd: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-channel-badge-switch"
        label="showBadge"
        [value]="channel().isBadge"
        (valueChange)="patchChannel({ isBadge: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-channel-lights-switch"
        label="enableLights"
        [value]="channel().isLights"
        (valueChange)="patchChannel({ isLights: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-channel-vibrate-switch"
        label="enableVibrate"
        [value]="channel().isVibrate"
        (valueChange)="patchChannel({ isVibrate: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-channel-sound-switch"
        label="sound default"
        [value]="channel().isDefaultSound"
        (valueChange)="patchChannel({ isDefaultSound: $event })"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="notifications-channels"
      title="Channels and groups (Android)"
      [color]="color"
      [calls]="channelCalls"
    />
    <Card testID="notifications-category-card" title="Category inputs">
      <Field
        testID="notifications-category-id-input"
        label="identifier"
        [value]="category().identifier"
        (valueChange)="patchCategory({ identifier: $event })"
      />
      <Field
        testID="notifications-action-id-input"
        label="action identifier"
        [value]="category().actionId"
        (valueChange)="patchCategory({ actionId: $event })"
      />
      <Field
        testID="notifications-button-title-input"
        label="buttonTitle"
        [value]="category().buttonTitle"
        (valueChange)="patchCategory({ buttonTitle: $event })"
      />
      <ToggleRow
        testID="notifications-text-input-switch"
        label="textInput"
        [value]="category().isTextInput"
        (valueChange)="patchCategory({ isTextInput: $event })"
        [color]="color"
      />
      <Field
        testID="notifications-placeholder-input"
        label="textInput placeholder"
        [value]="category().placeholder"
        (valueChange)="patchCategory({ placeholder: $event })"
      />
      <ToggleRow
        testID="notifications-destructive-switch"
        label="isDestructive"
        [value]="category().isDestructive"
        (valueChange)="patchCategory({ isDestructive: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-authentication-switch"
        label="isAuthenticationRequired"
        [value]="category().isAuthentication"
        (valueChange)="patchCategory({ isAuthentication: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-foreground-switch"
        label="opensAppToForeground"
        [value]="category().isForeground"
        (valueChange)="patchCategory({ isForeground: $event })"
        [color]="color"
      />
      <ToggleRow
        testID="notifications-dismiss-switch"
        label="customDismissAction (iOS)"
        [value]="category().isDismissAction"
        (valueChange)="patchCategory({ isDismissAction: $event })"
        [color]="color"
      />
      <Field
        testID="notifications-preview-input"
        label="previewPlaceholder (iOS)"
        [value]="category().previewPlaceholder"
        (valueChange)="patchCategory({ previewPlaceholder: $event })"
      />
    </Card>
    <CallConsole
      prefix="notifications-categories"
      title="Categories"
      [color]="color"
      [calls]="categoryCalls"
    />
  `,
})
export class NotificationChannels {
  readonly color = lineColorOf(ROUTE_NAME.Notifications);
  readonly importances = IMPORTANCES;
  readonly visibilities = VISIBILITIES;
  readonly usages = USAGES;
  readonly contentTypes = CONTENT_TYPES;

  readonly channel = signal<IChannelForm>({ ...INITIAL_CHANNEL_FORM });
  readonly category = signal<ICategoryForm>({ ...INITIAL_CATEGORY_FORM });

  readonly channelCalls = [
    {
      label: 'setNotificationChannelAsync',
      run: () => {
        const channel = this.channel();
        return setNotificationChannelAsync(channel.channelId, {
          name: channel.name,
          importance: channel.importance,
          description: channel.description,
          groupId: channel.groupId === '' ? undefined : channel.groupId,
          lightColor: channel.lightColor,
          lockscreenVisibility: channel.visibility,
          audioAttributes: {
            usage: channel.usage,
            contentType: channel.contentType,
          },
          vibrationPattern:
            channel.vibration === ''
              ? undefined
              : channel.vibration.split(',').map(Number),
          bypassDnd: channel.isBypassDnd,
          showBadge: channel.isBadge,
          enableLights: channel.isLights,
          enableVibrate: channel.isVibrate,
          sound: channel.isDefaultSound ? 'default' : null,
        });
      },
    },
    {
      label: 'getNotificationChannelsAsync',
      run: () => getNotificationChannelsAsync(),
    },
    {
      label: 'getNotificationChannelAsync',
      run: () => getNotificationChannelAsync(this.channel().channelId),
    },
    {
      label: 'deleteNotificationChannelAsync',
      run: () => deleteNotificationChannelAsync(this.channel().channelId),
    },
    {
      label: 'setNotificationChannelGroupAsync',
      run: () =>
        setNotificationChannelGroupAsync(this.channel().groupId, {
          name: this.channel().name,
          description: this.channel().description,
        }),
    },
    {
      label: 'getNotificationChannelGroupsAsync',
      run: () => getNotificationChannelGroupsAsync(),
    },
    {
      label: 'getNotificationChannelGroupAsync',
      run: () => getNotificationChannelGroupAsync(this.channel().groupId),
    },
    {
      label: 'deleteNotificationChannelGroupAsync',
      run: () => deleteNotificationChannelGroupAsync(this.channel().groupId),
    },
    {
      label: 'AndroidNotificationPriority',
      run: async () => AndroidNotificationPriority,
    },
  ];

  readonly categoryCalls = [
    {
      label: 'setNotificationCategoryAsync',
      run: () => {
        const category = this.category();
        return setNotificationCategoryAsync(
          category.identifier,
          [
            {
              identifier: category.actionId,
              buttonTitle: category.buttonTitle,
              textInput: category.isTextInput
                ? {
                    submitButtonTitle: 'Send',
                    placeholder: category.placeholder,
                  }
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
        );
      },
    },
    {
      label: 'getNotificationCategoriesAsync',
      run: () => getNotificationCategoriesAsync(),
    },
    {
      label: 'deleteNotificationCategoryAsync',
      run: () => deleteNotificationCategoryAsync(this.category().identifier),
    },
  ];

  patchChannel(change: Partial<IChannelForm>): void {
    this.channel.update(current => ({ ...current, ...change }));
  }

  patchCategory(change: Partial<ICategoryForm>): void {
    this.category.update(current => ({ ...current, ...change }));
  }
}
