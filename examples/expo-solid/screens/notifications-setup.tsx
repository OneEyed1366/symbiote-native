import { createSignal } from 'solid-js';
import {
  IosAlertStyle,
  IosAllowsPreviews,
  IosAuthorizationStatus,
  NotificationTimeoutError,
  PermissionStatus,
  getBadgeCountAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setBadgeCountAsync,
  setNotificationHandler,
} from '@symbiote-native/notifications/solid';
import type { INotificationBehavior } from '@symbiote-native/notifications/solid';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Notifications);

type IPermissionForm = {
  allowAlert: boolean;
  allowBadge: boolean;
  allowSound: boolean;
  allowDisplayInCarPlay: boolean;
  allowCriticalAlerts: boolean;
  provideAppNotificationSettings: boolean;
  allowProvisional: boolean;
};
type ISetPermission = (patch: Partial<IPermissionForm>) => void;

function PermissionCard(props: { form: IPermissionForm; setForm: ISetPermission }) {
  return (
    <Card testID="notifications-permission-card" title="requestPermissionsAsync (iOS flags)">
      <ToggleRow testID="notifications-allow-alert-switch" label="allowAlert" value={props.form.allowAlert} onChange={allowAlert => props.setForm({ allowAlert })} color={color} />
      <ToggleRow testID="notifications-allow-badge-switch" label="allowBadge" value={props.form.allowBadge} onChange={allowBadge => props.setForm({ allowBadge })} color={color} />
      <ToggleRow testID="notifications-allow-sound-switch" label="allowSound" value={props.form.allowSound} onChange={allowSound => props.setForm({ allowSound })} color={color} />
      <ToggleRow testID="notifications-allow-carplay-switch" label="allowDisplayInCarPlay" value={props.form.allowDisplayInCarPlay} onChange={allowDisplayInCarPlay => props.setForm({ allowDisplayInCarPlay })} color={color} />
      <ToggleRow testID="notifications-allow-critical-switch" label="allowCriticalAlerts" value={props.form.allowCriticalAlerts} onChange={allowCriticalAlerts => props.setForm({ allowCriticalAlerts })} color={color} />
      <ToggleRow testID="notifications-settings-switch" label="provideAppNotificationSettings" value={props.form.provideAppNotificationSettings} onChange={provideAppNotificationSettings => props.setForm({ provideAppNotificationSettings })} color={color} />
      <ToggleRow testID="notifications-provisional-switch" label="allowProvisional" value={props.form.allowProvisional} onChange={allowProvisional => props.setForm({ allowProvisional })} color={color} />
    </Card>
  );
}

function PermissionCalls(props: { form: IPermissionForm }) {
  const [badge, setBadge] = createSignal('3');
  return (
    <>
      <Card testID="notifications-badge-card" title="Badge input">
        <Field testID="notifications-badge-input" label="badge count" value={badge()} onChange={setBadge} />
      </Card>
      <CallConsole
        prefix="notifications-permissions"
        title="Permissions and badge"
        color={color}
        calls={[
          { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
          { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync({ ios: props.form }) },
          { label: 'requestPermissionsAsync (defaults)', run: () => requestPermissionsAsync() },
          { label: 'setBadgeCountAsync', run: () => setBadgeCountAsync(Number(badge())) },
          { label: 'getBadgeCountAsync', run: () => getBadgeCountAsync() },
          {
            label: 'status enums',
            run: async () => ({ IosAuthorizationStatus, IosAlertStyle, IosAllowsPreviews, PermissionStatus }),
          },
        ]}
      />
    </>
  );
}

type IHandlerForm = { shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean; delay: string; isFailing: boolean };

function HandlerCard(props: { form: IHandlerForm; setForm: (patch: Partial<IHandlerForm>) => void }) {
  return (
    <Card testID="notifications-handler-card" title="setNotificationHandler behavior">
      <ToggleRow testID="notifications-banner-switch" label="shouldShowBanner" value={props.form.shouldShowBanner} onChange={shouldShowBanner => props.setForm({ shouldShowBanner })} color={color} />
      <ToggleRow testID="notifications-list-switch" label="shouldShowList" value={props.form.shouldShowList} onChange={shouldShowList => props.setForm({ shouldShowList })} color={color} />
      <ToggleRow testID="notifications-sound-switch" label="shouldPlaySound" value={props.form.shouldPlaySound} onChange={shouldPlaySound => props.setForm({ shouldPlaySound })} color={color} />
      <ToggleRow testID="notifications-set-badge-switch" label="shouldSetBadge" value={props.form.shouldSetBadge} onChange={shouldSetBadge => props.setForm({ shouldSetBadge })} color={color} />
      <Field testID="notifications-delay-input" label="handleNotification delay ms (over 3000 times out)" value={props.form.delay} onChange={delay => props.setForm({ delay })} />
      <ToggleRow testID="notifications-failing-switch" label="handleNotification throws" value={props.form.isFailing} onChange={isFailing => props.setForm({ isFailing })} color={color} />
    </Card>
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function HandlerCalls(props: { form: IHandlerForm }) {
  const [log, setLog] = createSignal('handler not installed');
  const install = async () => {
    setNotificationHandler({
      handleNotification: async () => {
        await wait(Number(props.form.delay));
        if (props.form.isFailing) {
          throw new Error('handleNotification failed on purpose');
        }
        const behavior: INotificationBehavior = {
          shouldShowBanner: props.form.shouldShowBanner,
          shouldShowList: props.form.shouldShowList,
          shouldPlaySound: props.form.shouldPlaySound,
          shouldSetBadge: props.form.shouldSetBadge,
        };
        return behavior;
      },
      handleSuccess: id => setLog(`handleSuccess ${id}`),
      handleError: (id, error) =>
        setLog(`handleError ${id}: ${error instanceof NotificationTimeoutError ? 'NotificationTimeoutError' : error.message}`),
    });
    return 'handler installed';
  };
  return (
    <>
      <CallConsole
        prefix="notifications-handler"
        title="Notification handler"
        color={color}
        hint="Schedule a notification with the app in the foreground to see the handler run."
        calls={[
          { label: 'setNotificationHandler', run: install },
          { label: 'setNotificationHandler (null)', run: async () => { setNotificationHandler(null); return 'handler removed'; } },
        ]}
      />
      <text testID="notifications-handler-log" class="info-text">{log()}</text>
    </>
  );
}

export function SetupCards() {
  const [permissions, setPermissionsState] = createSignal<IPermissionForm>({
    allowAlert: true,
    allowBadge: true,
    allowSound: true,
    allowDisplayInCarPlay: false,
    allowCriticalAlerts: false,
    provideAppNotificationSettings: false,
    allowProvisional: false,
  });
  const [handler, setHandlerState] = createSignal<IHandlerForm>({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    delay: '0',
    isFailing: false,
  });
  return (
    <>
      <PermissionCard form={permissions()} setForm={patch => setPermissionsState(previous => ({ ...previous, ...patch }))} />
      <PermissionCalls form={permissions()} />
      <HandlerCard form={handler()} setForm={patch => setHandlerState(previous => ({ ...previous, ...patch }))} />
      <HandlerCalls form={handler()} />
    </>
  );
}
