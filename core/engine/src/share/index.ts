// The runtime is RN's own `Share`, forwarded through `react-native-host`

export type IShareContent =
  | { title?: string; url: string; message?: string }
  | { title?: string; url?: string; message: string };

export type IShareOptions = {
  dialogTitle?: string;
  subject?: string;
  excludedActivityTypes?: string[];
  tintColor?: unknown;
  anchor?: number;
};

export type IShareAction = {
  action: string;
  activityType?: string | null;
};
