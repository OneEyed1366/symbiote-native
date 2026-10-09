// The runtime is RN's own `Alert`, forwarded through `react-native-host`

export type IAlertType =
  'default' | 'plain-text' | 'secure-text' | 'login-password';

export type IAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type IAlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  isPreferred?: boolean;
  style?: IAlertButtonStyle;
};

export type IAlertButtons = IAlertButton[];

export type IAlertOptions = {
  cancelable?: boolean;
  userInterfaceStyle?: 'unspecified' | 'light' | 'dark';
  onDismiss?: () => void;
};
