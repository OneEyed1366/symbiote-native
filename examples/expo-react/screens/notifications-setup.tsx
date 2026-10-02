import { useRef, useState } from 'react';
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
} from '@symbiote-native/notifications/react';
import type { INotificationBehavior } from '@symbiote-native/notifications/react';
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

function PermissionCard({ form, setForm }: { form: IPermissionForm; setForm: ISetPermission }) {
  return (
    <Card testID="notifications-permission-card" title="requestPermissionsAsync (iOS flags)">
      <ToggleRow testID="notifications-allow-alert-switch" label="allowAlert" value={form.allowAlert} onChange={allowAlert => setForm({ allowAlert })} color={color} />
      <ToggleRow testID="notifications-allow-badge-switch" label="allowBadge" value={form.allowBadge} onChange={allowBadge => setForm({ allowBadge })} color={color} />
      <ToggleRow testID="notifications-allow-sound-switch" label="allowSound" value={form.allowSound} onChange={allowSound => setForm({ allowSound })} color={color} />
      <ToggleRow testID="notifications-allow-carplay-switch" label="allowDisplayInCarPlay" value={form.allowDisplayInCarPlay} onChange={allowDisplayInCarPlay => setForm({ allowDisplayInCarPlay })} color={color} />
      <ToggleRow testID="notifications-allow-critical-switch" label="allowCriticalAlerts" value={form.allowCriticalAlerts} onChange={allowCriticalAlerts => setForm({ allowCriticalAlerts })} color={color} />
      <ToggleRow testID="notifications-settings-switch" label="provideAppNotificationSettings" value={form.provideAppNotificationSettings} onChange={provideAppNotificationSettings => setForm({ provideAppNotificationSettings })} color={color} />
      <ToggleRow testID="notifications-provisional-switch" label="allowProvisional" value={form.allowProvisional} onChange={allowProvisional => setForm({ allowProvisional })} color={color} />
    </Card>
  );
}

function PermissionCalls({ form }: { form: IPermissionForm }) {
  const [badge, setBadge] = useState('3');
  return (
    <>
      <Card testID="notifications-badge-card" title="Badge input">
        <Field testID="notifications-badge-input" label="badge count" value={badge} onChange={setBadge} />
      </Card>
      <CallConsole
        prefix="notifications-permissions"
        title="Permissions and badge"
        color={color}
        calls={[
          { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
          { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync({ ios: form }) },
          { label: 'requestPermissionsAsync (defaults)', run: () => requestPermissionsAsync() },
          { label: 'setBadgeCountAsync', run: () => setBadgeCountAsync(Number(badge)) },
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

function HandlerCard({ form, setForm }: { form: IHandlerForm; setForm: (patch: Partial<IHandlerForm>) => void }) {
  return (
    <Card testID="notifications-handler-card" title="setNotificationHandler behavior">
      <ToggleRow testID="notifications-banner-switch" label="shouldShowBanner" value={form.shouldShowBanner} onChange={shouldShowBanner => setForm({ shouldShowBanner })} color={color} />
      <ToggleRow testID="notifications-list-switch" label="shouldShowList" value={form.shouldShowList} onChange={shouldShowList => setForm({ shouldShowList })} color={color} />
      <ToggleRow testID="notifications-sound-switch" label="shouldPlaySound" value={form.shouldPlaySound} onChange={shouldPlaySound => setForm({ shouldPlaySound })} color={color} />
      <ToggleRow testID="notifications-set-badge-switch" label="shouldSetBadge" value={form.shouldSetBadge} onChange={shouldSetBadge => setForm({ shouldSetBadge })} color={color} />
      <Field testID="notifications-delay-input" label="handleNotification delay ms (over 3000 times out)" value={form.delay} onChange={delay => setForm({ delay })} />
      <ToggleRow testID="notifications-failing-switch" label="handleNotification throws" value={form.isFailing} onChange={isFailing => setForm({ isFailing })} color={color} />
    </Card>
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function HandlerCalls({ form }: { form: IHandlerForm }) {
  const [log, setLog] = useState('handler not installed');
  const latest = useRef(form);
  latest.current = form;
  const install = async () => {
    setNotificationHandler({
      handleNotification: async () => {
        await wait(Number(latest.current.delay));
        if (latest.current.isFailing) {
          throw new Error('handleNotification failed on purpose');
        }
        const behavior: INotificationBehavior = {
          shouldShowBanner: latest.current.shouldShowBanner,
          shouldShowList: latest.current.shouldShowList,
          shouldPlaySound: latest.current.shouldPlaySound,
          shouldSetBadge: latest.current.shouldSetBadge,
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
      <text testID="notifications-handler-log" className="info-text">{log}</text>
    </>
  );
}

export function SetupCards() {
  const [permissions, setPermissionsState] = useState<IPermissionForm>({
    allowAlert: true,
    allowBadge: true,
    allowSound: true,
    allowDisplayInCarPlay: false,
    allowCriticalAlerts: false,
    provideAppNotificationSettings: false,
    allowProvisional: false,
  });
  const [handler, setHandlerState] = useState<IHandlerForm>({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    delay: '0',
    isFailing: false,
  });
  return (
    <>
      <PermissionCard form={permissions} setForm={patch => setPermissionsState(previous => ({ ...previous, ...patch }))} />
      <PermissionCalls form={permissions} />
      <HandlerCard form={handler} setForm={patch => setHandlerState(previous => ({ ...previous, ...patch }))} />
      <HandlerCalls form={handler} />
    </>
  );
}
