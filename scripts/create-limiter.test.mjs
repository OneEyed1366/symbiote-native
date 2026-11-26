import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';

import { createLimiter } from './lib/create-limiter.mjs';

test('never runs more tasks at once than the limit, and still runs them all', async () => {
  const limit = createLimiter(3);
  let active = 0;
  let peak = 0;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await nextTurn();
        active -= 1;
        return index;
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('a rejected task frees its slot and keeps its error', async () => {
  const limit = createLimiter(1);
  const failed = limit(() => Promise.reject(new Error('pack failed')));
  const next = limit(() => Promise.resolve('ran'));
  await assert.rejects(failed, /pack failed/);
  assert.equal(await next, 'ran');
});
