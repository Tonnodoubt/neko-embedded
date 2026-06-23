import { describe, expect, it } from 'vitest';

import { extractSpeechSegments } from './speechSegments';

describe('extractSpeechSegments', () => {
  it('splits completed sentences and keeps pending text', () => {
    expect(extractSpeechSegments('你好！还没说完', false)).toEqual({
      segments: ['你好！'],
      remainingText: '还没说完',
    });
  });

  it('includes trailing closers with sentence punctuation', () => {
    expect(extractSpeechSegments('她说“好呀。”下一句', false)).toEqual({
      segments: ['她说“好呀。”'],
      remainingText: '下一句',
    });
  });

  it('keeps repeated sentence punctuation with the preceding speech text', () => {
    expect(extractSpeechSegments('嗯......TTS失败了吗', false, 8)).toEqual({
      segments: ['嗯......'],
      remainingText: 'TTS失败了吗',
    });
  });

  it('does not emit punctuation-only speech segments', () => {
    expect(extractSpeechSegments('......', true)).toEqual({
      segments: [],
      remainingText: '',
    });
  });

  it('keeps comma-only pending text until the fallback threshold', () => {
    const text = '这是一段比较长的语音文本，需要先在逗号处分段，然后继续等待更多内容直到超过阈值';

    expect(extractSpeechSegments(text, false)).toEqual({
      segments: [],
      remainingText: text,
    });
  });

  it('flushes remaining text when requested', () => {
    expect(extractSpeechSegments('还没有标点', true)).toEqual({
      segments: ['还没有标点'],
      remainingText: '',
    });
  });

  it('waits for a natural break before splitting realtime speech', () => {
    expect(extractSpeechSegments('这是一段需要更快开口的回复', false, 8)).toEqual({
      segments: [],
      remainingText: '这是一段需要更快开口的回复',
    });
  });

  it('does not use comma punctuation as an early realtime speech break', () => {
    expect(extractSpeechSegments('这是一段需要更快开口，后面继续', false, 8)).toEqual({
      segments: [],
      remainingText: '这是一段需要更快开口，后面继续',
    });
  });

  it('uses comma punctuation only as a fallback speech break', () => {
    expect(extractSpeechSegments('这是一段需要更快开口，后面继续多一点', false, 8)).toEqual({
      segments: ['这是一段需要更快开口，'],
      remainingText: '后面继续多一点',
    });
  });

  it('hard splits very long speech without punctuation as a fallback', () => {
    expect(extractSpeechSegments('abcdefghijklmnopqr', false, 8)).toEqual({
      segments: ['abcdefghijklmnop'],
      remainingText: 'qr',
    });
  });
});
