// Props a package consumes itself (an animation library) are claimed here and never reach Fabric
import type { ISymbioteNode } from './node-types';

export type IPropClaim = (
  node: ISymbioteNode,
  key: string,
  value: unknown,
) => boolean;

const claims: IPropClaim[] = [];

// Gate for `routeProp`, the hottest path: an app with no claim pays one length read
export function hasPropClaims(): boolean {
  return claims.length > 0;
}

// Returns the release, so a test can leave the registry as it found it
export function registerPropClaim(claim: IPropClaim): () => void {
  claims.push(claim);
  return () => {
    const at = claims.indexOf(claim);
    if (at !== -1) claims.splice(at, 1);
  };
}

export function isPropClaimed(
  node: ISymbioteNode,
  key: string,
  value: unknown,
): boolean {
  return claims.some(claim => claim(node, key, value));
}
