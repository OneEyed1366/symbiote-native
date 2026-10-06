// `ReactNativeVersion.js` of RN, read from the `PlatformConstants` the host reports

import { Platform } from '../platform';

const UNKNOWN_PART = 0;

// Read per access, the constants resolve on the first read and a late host is still picked up
const version = () => Platform.constants?.reactNativeVersion;

export const ReactNativeVersion = {
  get major(): number {
    return version()?.major ?? UNKNOWN_PART;
  },
  get minor(): number {
    return version()?.minor ?? UNKNOWN_PART;
  },
  get patch(): number {
    return version()?.patch ?? UNKNOWN_PART;
  },
  get prerelease(): string | null {
    const prerelease = version()?.prerelease;
    return prerelease == null ? null : `${prerelease}`;
  },
  getVersionString(): string {
    const prerelease = this.prerelease;
    const suffix = prerelease == null ? '' : `-${prerelease}`;
    return `${this.major}.${this.minor}.${this.patch}${suffix}`;
  },
};
