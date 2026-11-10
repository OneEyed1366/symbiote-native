// RN's own `ReactNativeVersion`, the version of the `react-native` package in the JS bundle
// @ts-expect-error - untyped Flow source
import ReactNativeVersionUpstream from 'react-native/Libraries/Core/ReactNativeVersion';

export type IReactNativeVersion = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: string | null;
  getVersionString(): string;
};

export const ReactNativeVersion: IReactNativeVersion =
  ReactNativeVersionUpstream;
