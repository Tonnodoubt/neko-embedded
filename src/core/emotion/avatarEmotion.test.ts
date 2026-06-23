import { describe, expect, it } from 'vitest';

import { inferAvatarEmotionFromText } from './avatarEmotion';

describe('inferAvatarEmotionFromText', () => {
  it('maps positive text to happy avatar intent', () => {
    expect(inferAvatarEmotionFromText('太好了，今天真的很开心').emotion).toBe('happy');
  });

  it('maps reflective text to thinking avatar intent', () => {
    const signal = inferAvatarEmotionFromText('嗯，让我想想，这里可能有两个原因。');

    expect(signal).toMatchObject({
      emotion: 'thinking',
      gesture: 'tilt',
      source: 'heuristic',
    });
  });

  it('falls back to neutral for plain text', () => {
    expect(inferAvatarEmotionFromText('The response contains a factual update.')).toMatchObject({
      emotion: 'neutral',
      gesture: 'none',
    });
  });
});
