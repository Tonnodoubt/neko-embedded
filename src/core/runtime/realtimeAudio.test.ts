import { describe, expect, it } from 'vitest';

import { calculateRms } from './realtimeAudio';

describe('calculateRms', () => {
  it('returns zero for empty and silent frames', () => {
    expect(calculateRms(new Int16Array())).toBe(0);
    expect(calculateRms(new Int16Array([0, 0, 0]))).toBe(0);
  });

  it('normalizes int16 samples', () => {
    expect(calculateRms(new Int16Array([32767, -32768]))).toBeCloseTo(1, 4);
    expect(calculateRms(new Int16Array([16384, -16384]))).toBeCloseTo(0.5, 4);
  });
});
