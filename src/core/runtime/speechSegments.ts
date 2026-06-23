const SPEECH_SENTENCE_END_PATTERN = /[。！？；….!?;]+/u;
const SPEECH_CONTENT_PATTERN = /[A-Za-z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u;
const SPEECH_MAX_PENDING_CHARS = 36;
const SPEECH_HARD_SPLIT_MULTIPLIER = 2;
const SPEECH_TRAILING_CLOSERS = new Set(['"', "'", '”', '’', ')', '）', ']', '】', '」', '』']);

export function extractSpeechSegments(
  text: string,
  forceFlush: boolean,
  maxPendingChars = SPEECH_MAX_PENDING_CHARS,
): {
  segments: string[];
  remainingText: string;
} {
  let remainingText = text;
  const segments: string[] = [];

  while (remainingText.length > 0) {
    const sentenceEndIndex = findSentenceEndIndex(remainingText);

    if (sentenceEndIndex >= 0) {
      const splitIndex = includeSentenceEndRunAndTrailingClosers(remainingText, sentenceEndIndex);
      segments.push(remainingText.slice(0, splitIndex).trim());
      remainingText = remainingText.slice(splitIndex);
      continue;
    }

    const hardSplitIndex = maxPendingChars * SPEECH_HARD_SPLIT_MULTIPLIER;

    if (remainingText.length >= hardSplitIndex) {
      const splitIndex = findFallbackSplitIndex(remainingText, maxPendingChars, hardSplitIndex);
      segments.push(remainingText.slice(0, splitIndex).trim());
      remainingText = remainingText.slice(splitIndex);
      continue;
    }

    break;
  }

  if (forceFlush && remainingText.trim()) {
    segments.push(remainingText.trim());
    remainingText = '';
  }

  return {
    segments: segments.filter(hasSpeechContent),
    remainingText,
  };
}

function findSentenceEndIndex(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    if (SPEECH_SENTENCE_END_PATTERN.test(text[index])) {
      return index;
    }
  }

  return -1;
}

function includeSentenceEndRunAndTrailingClosers(text: string, sentenceEndIndex: number): number {
  let nextIndex = sentenceEndIndex;

  while (nextIndex < text.length && SPEECH_SENTENCE_END_PATTERN.test(text[nextIndex])) {
    nextIndex += 1;
  }

  while (nextIndex < text.length && SPEECH_TRAILING_CLOSERS.has(text[nextIndex])) {
    nextIndex += 1;
  }

  return nextIndex;
}

function hasSpeechContent(text: string): boolean {
  return SPEECH_CONTENT_PATTERN.test(text);
}

function findFallbackSplitIndex(text: string, maxPendingChars: number, hardSplitIndex: number): number {
  const searchText = text.slice(0, hardSplitIndex);
  const punctuationCandidates = ['，', ',', '、', '：', ':'];

  for (let index = searchText.length - 1; index >= Math.min(10, maxPendingChars - 1); index -= 1) {
    if (punctuationCandidates.includes(searchText[index])) {
      return index + 1;
    }
  }

  return hardSplitIndex;
}
