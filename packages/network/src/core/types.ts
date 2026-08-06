// Hand-ported from .vendors/expo/packages/expo-network/src/Network.types.ts (sdk-57) — plain
// data shapes, no `expo` meta-package import to swap out (unlike local-auth's types.ts).

export enum NetworkStateType {
  /** No active network connection detected. */
  NONE = 'NONE',
  /** The connection type could not be determined. */
  UNKNOWN = 'UNKNOWN',
  /** Active network connection over mobile data.
   * @platform android
   * @platform ios
   */
  CELLULAR = 'CELLULAR',
  /** Active network connection over Wi-Fi.
   * @platform android
   * @platform ios
   */
  WIFI = 'WIFI',
  /** Active network connection over Bluetooth.
   * @platform android
   */
  BLUETOOTH = 'BLUETOOTH',
  /** Active network connection over Ethernet.
   * @platform android
   * @platform ios
   */
  ETHERNET = 'ETHERNET',
  /** Active network connection over WiMAX.
   * @platform android
   */
  WIMAX = 'WIMAX',
  /** Active network connection over VPN.
   * @platform android
   */
  VPN = 'VPN',
  /** Active network connection over other network connection types.
   * @platform android
   */
  OTHER = 'OTHER',
}

export type NetworkState = {
  /** The current network connection type. */
  type?: NetworkStateType;
  /**
   * If there is an active network connection. Note that this does not mean internet is
   * reachable. `false` when `type` is `NONE` or `UNKNOWN`, `true` otherwise.
   */
  isConnected?: boolean;
  /**
   * If the internet is reachable with the currently active network connection. On Android this
   * requires internet capability, confirmed internet access, and a usable connection state; VPN
   * connections also require non-zero downstream bandwidth. On iOS this always matches
   * `isConnected`.
   */
  isInternetReachable?: boolean;
};

/** Passed as the argument to listeners registered with `addNetworkStateListener()`. */
export type NetworkStateEvent = NetworkState;
