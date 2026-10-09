// RN's own Origami spring conversions, typed here because the upstream source ships no types
// A grid sweep matched them exactly before the hand copy was dropped
// @ts-expect-error - untyped Flow source
import * as SpringConfigUpstream from 'react-native/Libraries/Animated/SpringConfig';

export type ISpringConfigValues = {
  stiffness: number;
  damping: number;
};

export const fromOrigamiTensionAndFriction: (
  tension: number,
  friction: number,
) => ISpringConfigValues = SpringConfigUpstream.fromOrigamiTensionAndFriction;

export const fromBouncinessAndSpeed: (
  bounciness: number,
  speed: number,
) => ISpringConfigValues = SpringConfigUpstream.fromBouncinessAndSpeed;
