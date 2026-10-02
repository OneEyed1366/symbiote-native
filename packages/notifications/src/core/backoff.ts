// Ported from expo-notifications sdk-57 utils/backoff.ts, itself from ide/backoff
export function computeNextBackoffInterval(
  initialBackoff: number,
  previousRetryCount: number,
  {
    multiplier = 1.5,
    randomizationFactor = 0.25,
    minBackoff = initialBackoff,
    maxBackoff = Infinity,
  } = {},
): number {
  if (initialBackoff <= 0) initialBackoff = 1;
  if (previousRetryCount < 0) previousRetryCount = 0;
  if (multiplier < 1) multiplier = 1;
  if (randomizationFactor < 0 || randomizationFactor > 1)
    randomizationFactor = 0;

  const nextBackoff = initialBackoff * multiplier ** previousRetryCount;
  // Jitter within the negative to positive range of the randomization factor
  const jitterFactor =
    1 - randomizationFactor + 2 * randomizationFactor * Math.random();

  return Math.min(Math.max(nextBackoff * jitterFactor, minBackoff), maxBackoff);
}
