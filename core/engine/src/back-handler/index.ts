// The runtime is RN's own `BackHandler`, forwarded through `react-native-host`

// `backPress` is RN's legacy alias for `hardwareBackPress`
export type IBackPressEventName = 'backPress' | 'hardwareBackPress';

// RN's HardwareBackPressEvent is a DOM `Event`, handlers read `type` and `timeStamp` off it
export type IHardwareBackPressEvent = {
  readonly type: 'hardwareBackPress';
  readonly timeStamp: number;
};

// True consumes the press, otherwise earlier handlers run and then the native default
export type IBackPressHandler = (
  event: IHardwareBackPressEvent,
) => boolean | null | undefined | void;
