# @symbiote-native/foreground-service

Android foreground-service lifecycle for SymbioteNative. It provides one active service with
`microphone` and/or `mediaPlayback` types, a persistent notification, lifecycle state/events, a
native stop action, and delivery into a task registered through any Symbiote adapter's `AppRegistry`.

It does **not** record audio, play media, create a media session, or bypass Android's background
launch rules. Those remain the application's responsibility.

## Usage

```ts
import { AppRegistry } from '@symbiote-native/react'; // or vue/angular/svelte/solid
import {
  addForegroundServiceListener,
  startForegroundServiceAsync,
  stopForegroundServiceAsync,
} from '@symbiote-native/foreground-service';

AppRegistry.registerCancellableHeadlessTask(
  'voice-session',
  () => async data => {
    // Keep this Promise pending for as long as the service should remain alive.
    await runVoiceSession(data);
  },
  () => () => cancelVoiceSession(),
);

const subscription = addForegroundServiceListener(event => {
  console.log(event.type, event.state);
});

await startForegroundServiceAsync({
  taskKey: 'voice-session',
  data: { roomId: 'room-1' },
  types: ['microphone', 'mediaPlayback'],
  notification: {
    channelId: 'voice',
    channelName: 'Voice sessions',
    title: 'Voice session active',
    body: 'Tap to return',
    smallIcon: 'ic_voice',
    stopActionLabel: 'Stop',
  },
});

await stopForegroundServiceAsync();
subscription.remove();
```

The start promise resolves after Android has promoted the service and begun the Headless JS
runtime/task startup path. On a cold process, it does not wait for the task body itself to begin. If
Android does not acknowledge startup within ten seconds, the promise rejects and the pending service
is stopped. Resolving the task Promise is the normal completion path: React Native releases its wake
lock and the service stops. An ordinary task rejection does not complete React Native's task
accounting, so error paths should explicitly stop the service or use a finite `taskTimeoutMs`.
Explicit and notification-action stops finish the active task before removing the notification.

## Android requirements

The package contributes the service declaration, foreground-service permissions, and the normal
`WAKE_LOCK` permission React Native's Headless JS runtime uses while a task is active. It
intentionally does **not** add `RECORD_AUDIO`: applications using the `microphone`
type must declare and obtain that runtime permission themselves. Start microphone work while the
application has foreground visibility; Android may reject a background start.

Apps targeting Android 13 or later may request `POST_NOTIFICATIONS`. The foreground service still
requires a notification even when the user does not permit it in the notification drawer.

The notification `smallIcon` is an Android drawable or mipmap resource name. If omitted, the
application icon is used. `stopActionLabel` adds a native action that stops the service without first
opening a JS surface.

## API

```ts
startForegroundServiceAsync(options): Promise<void>
updateForegroundServiceNotificationAsync(options): Promise<void>
stopForegroundServiceAsync(): Promise<void>
getForegroundServiceStateAsync(): Promise<IForegroundServiceState>
addForegroundServiceListener(listener): IEventSubscription
```

Notification updates replace the visible title/body while preserving the icon and native stop action.

Only one service can be active. The state reports `starting`, `running`, `stopping`, `stopped`, or
`failed`, plus its types, task key, notification ID, start time, stop reason, and last native error.
