// Set once any binding to a node exists, so `removeChild` knows a removed node may owe a release
let isAnyBound = false;

export function hasNodeBindings(): boolean {
  return isAnyBound;
}

export function noteNodeBinding(): void {
  isAnyBound = true;
}
