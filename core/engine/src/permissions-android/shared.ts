// PermissionsAndroid, platform-neutral half: the frozen PERMISSIONS / RESULTS maps and the public
// types, copied verbatim from RN's Libraries/PermissionsAndroid/PermissionsAndroid.js. The behavior
// is per platform, as in RN: index.android.ts talks to the native module, index.ios.ts is RN's
// `Platform.OS !== 'android'` branch.
//
// The native contract, from RN's TurboModule spec (`'PermissionsAndroid'`):
//   checkPermission(permission): Promise<boolean>
//   requestPermission(permission): Promise<string>
//   shouldShowRequestPermissionRationale(permission): Promise<boolean>
//   requestMultiplePermissions(permissions): Promise<{[permission]: string}>

export const PERMISSIONS_ANDROID_MODULE = 'PermissionsAndroid';

export const ANDROID_ONLY_WARNING =
  '"PermissionsAndroid" module works only for Android platform.';
export const CHECK_PERMISSION_DEPRECATED =
  '"PermissionsAndroid.checkPermission" is deprecated. Use "PermissionsAndroid.check" instead';
export const REQUEST_PERMISSION_DEPRECATED =
  '"PermissionsAndroid.requestPermission" is deprecated. Use "PermissionsAndroid.request" instead';

// The runtime-permission result strings Android can return.
export const RESULTS = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
  NEVER_ASK_AGAIN: 'never_ask_again',
} as const);

export type IPermissionStatus = (typeof RESULTS)[keyof typeof RESULTS];

// The full Android permission-string map, copied verbatim from RN's source.
export const PERMISSIONS = Object.freeze({
  READ_CALENDAR: 'android.permission.READ_CALENDAR',
  WRITE_CALENDAR: 'android.permission.WRITE_CALENDAR',
  CAMERA: 'android.permission.CAMERA',
  READ_CONTACTS: 'android.permission.READ_CONTACTS',
  WRITE_CONTACTS: 'android.permission.WRITE_CONTACTS',
  GET_ACCOUNTS: 'android.permission.GET_ACCOUNTS',
  ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
  ACCESS_BACKGROUND_LOCATION: 'android.permission.ACCESS_BACKGROUND_LOCATION',
  RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
  READ_PHONE_STATE: 'android.permission.READ_PHONE_STATE',
  CALL_PHONE: 'android.permission.CALL_PHONE',
  READ_CALL_LOG: 'android.permission.READ_CALL_LOG',
  WRITE_CALL_LOG: 'android.permission.WRITE_CALL_LOG',
  ADD_VOICEMAIL: 'com.android.voicemail.permission.ADD_VOICEMAIL',
  READ_VOICEMAIL: 'com.android.voicemail.permission.READ_VOICEMAIL',
  WRITE_VOICEMAIL: 'com.android.voicemail.permission.WRITE_VOICEMAIL',
  USE_SIP: 'android.permission.USE_SIP',
  PROCESS_OUTGOING_CALLS: 'android.permission.PROCESS_OUTGOING_CALLS',
  BODY_SENSORS: 'android.permission.BODY_SENSORS',
  BODY_SENSORS_BACKGROUND: 'android.permission.BODY_SENSORS_BACKGROUND',
  SEND_SMS: 'android.permission.SEND_SMS',
  RECEIVE_SMS: 'android.permission.RECEIVE_SMS',
  READ_SMS: 'android.permission.READ_SMS',
  RECEIVE_WAP_PUSH: 'android.permission.RECEIVE_WAP_PUSH',
  RECEIVE_MMS: 'android.permission.RECEIVE_MMS',
  READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
  READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
  READ_MEDIA_VIDEO: 'android.permission.READ_MEDIA_VIDEO',
  READ_MEDIA_AUDIO: 'android.permission.READ_MEDIA_AUDIO',
  READ_MEDIA_VISUAL_USER_SELECTED:
    'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
  BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
  BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
  BLUETOOTH_ADVERTISE: 'android.permission.BLUETOOTH_ADVERTISE',
  ACCESS_MEDIA_LOCATION: 'android.permission.ACCESS_MEDIA_LOCATION',
  ACCEPT_HANDOVER: 'android.permission.ACCEPT_HANDOVER',
  ACTIVITY_RECOGNITION: 'android.permission.ACTIVITY_RECOGNITION',
  ANSWER_PHONE_CALLS: 'android.permission.ANSWER_PHONE_CALLS',
  READ_PHONE_NUMBERS: 'android.permission.READ_PHONE_NUMBERS',
  UWB_RANGING: 'android.permission.UWB_RANGING',
  POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
  NEARBY_WIFI_DEVICES: 'android.permission.NEARBY_WIFI_DEVICES',
} as const);

export type IPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// The optional rationale dialog request() shows through DialogManagerAndroid.
export type IRationale = {
  title: string;
  message: string;
  buttonPositive?: string;
  buttonNegative?: string;
  buttonNeutral?: string;
};
