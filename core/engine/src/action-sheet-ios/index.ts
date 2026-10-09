// The runtime is RN's own `ActionSheetIOS`, forwarded through `react-native-host`

export type IActionSheetIOSOptions = {
  title?: string;
  message?: string;
  options: string[];
  destructiveButtonIndex?: number | number[];
  cancelButtonIndex?: number;
  anchor?: number;
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
  userInterfaceStyle?: string;
  disabledButtonIndices?: number[];
};

export type IShareActionSheetIOSOptions = {
  message?: string;
  url?: string;
  subject?: string;
  anchor?: number;
  tintColor?: unknown;
  cancelButtonTintColor?: unknown;
  disabledButtonTintColor?: unknown;
  excludedActivityTypes?: string[];
  userInterfaceStyle?: string;
};

export type IShareActionSheetError = {
  domain: string;
  code: string;
  userInfo?: Record<string, unknown>;
  message: string;
};
