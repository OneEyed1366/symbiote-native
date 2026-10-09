// RN's own `processAspectRatio`, a throw becomes a `dlog` since a commit must not abort
// @ts-expect-error - untyped Flow source
import processAspectRatioUpstream from 'react-native/Libraries/StyleSheet/processAspectRatio';
import { dlog } from './debug';

export function processAspectRatio(
  aspectRatio: number | string | undefined,
): number | undefined {
  try {
    return processAspectRatioUpstream(aspectRatio);
  } catch (error) {
    dlog(
      `processAspectRatio: dropped an invalid ratio - ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
