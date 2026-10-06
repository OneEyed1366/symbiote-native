import type { ISymbioteExpoLinkOptionalBundle } from '@symbiote-native/expo-modules-link';

// The opt-in manifest bundles of the layers, each mirrors the `android.optionalManifestBundles`
// of the package's own native-link.json and is cross-checked against it in the layers test

type IBundles = readonly ISymbioteExpoLinkOptionalBundle[];

export const AUDIO_BUNDLES: IBundles = [
  {
    id: 'recording',
    label: 'Background audio recording',
    warning:
      'Requesting FOREGROUND_SERVICE_MICROPHONE triggers Play Console policy review — Google requires a clear, prominent in-app disclosure and justification before you can publish.',
    nextSteps:
      'Pass `allowsBackgroundRecording: true` to setAudioModeAsync so recording keeps running with the app backgrounded.',
    manifestPermissions: [
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.POST_NOTIFICATIONS',
    ],
    manifestServices: [
      {
        name: 'expo.modules.audio.service.AudioRecordingService',
        foregroundServiceType: 'microphone',
      },
    ],
  },
];

export const LOCATION_BUNDLES: IBundles = [
  {
    id: 'background',
    label: 'Background location tracking',
    warning:
      'Requesting ACCESS_BACKGROUND_LOCATION and the location foreground-service permissions triggers Play Console policy review — Google requires a clear, prominent in-app disclosure and justification before you can publish.',
    nextSteps:
      "Pass a `foregroundService` option to `startLocationUpdatesAsync` (notification title/body) so the OS keeps tracking alive outside the app. expo-location's own LocationTaskService is already declared in its AndroidManifest.xml and merges automatically — this only adds the permissions it needs.",
    manifestPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ],
  },
];

export const VIDEO_BUNDLES: IBundles = [
  {
    id: 'backgroundPlayback',
    label: 'Background video playback',
    warning:
      'Requesting FOREGROUND_SERVICE_MEDIA_PLAYBACK triggers Play Console policy review for a foreground service, Google asks for a justification before you can publish.',
    nextSteps:
      'Set `staysActiveInBackground` and `showNowPlayingNotification` on the player. On iOS add `audio` to UIBackgroundModes in Info.plist yourself.',
    manifestPermissions: [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    ],
    manifestServices: [
      {
        name: 'expo.modules.video.playbackService.ExpoVideoPlaybackService',
        foregroundServiceType: 'mediaPlayback',
        intentFilterActions: ['androidx.media3.session.MediaSessionService'],
      },
    ],
  },
];
