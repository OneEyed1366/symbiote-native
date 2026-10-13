// What a composable returned the first time, read after the component that ran it
export function firstResultOf<Result>(results: readonly Result[]): Result {
  const first = results.at(0);
  if (first === undefined) throw new Error('the composable has not run');
  return first;
}
