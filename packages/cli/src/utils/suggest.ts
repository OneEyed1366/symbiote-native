// Optimal string alignment distance (Levenshtein + adjacent transposition) — command/flag typos
// are almost always a swapped pair of adjacent letters ("nwe" for "new"), which plain
// Levenshtein prices at 2 edits and transposition-aware distance prices at the realistic 1.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );

  for (let row = 0; row < rows; row += 1) distances[row][0] = row;
  for (let col = 0; col < cols; col += 1) distances[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      let best = Math.min(
        distances[row - 1][col] + 1,
        distances[row][col - 1] + 1,
        distances[row - 1][col - 1] + cost,
      );
      const isAdjacentTransposition =
        row > 1 &&
        col > 1 &&
        a[row - 1] === b[col - 2] &&
        a[row - 2] === b[col - 1];
      if (isAdjacentTransposition) {
        best = Math.min(best, distances[row - 2][col - 2] + 1);
      }
      distances[row][col] = best;
    }
  }

  return distances[rows - 1][cols - 1];
}

// Only surfaces a suggestion within half the longer string's length — far enough off and it's
// noise, not a typo.
export function findClosestMatch(
  input: string,
  candidates: readonly string[],
): string | undefined {
  let closest: string | undefined;
  let closestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = candidate;
    }
  }

  if (closest === undefined) return undefined;

  const threshold = Math.max(
    1,
    Math.floor(Math.max(input.length, closest.length) / 2),
  );
  return closestDistance <= threshold ? closest : undefined;
}
