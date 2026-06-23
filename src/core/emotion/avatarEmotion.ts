export type AvatarEmotion =
  | 'neutral'
  | 'attentive'
  | 'thinking'
  | 'happy'
  | 'surprised'
  | 'sad'
  | 'angry';

export type AvatarGesture = 'none' | 'nod' | 'recoil' | 'bounce' | 'tilt' | 'shake';

export type AvatarEmotionSource = 'heuristic';

export interface AvatarEmotionSignal {
  emotion: AvatarEmotion;
  gesture: AvatarGesture;
  confidence: number;
  source: AvatarEmotionSource;
}

type EmotionScore = Exclude<AvatarEmotion, 'neutral'>;

const emotionKeywords: Record<EmotionScore, RegExp[]> = {
  angry: [
    /生气|气死|烦死|讨厌|闭嘴|滚|离谱|恼火|愤怒|angry|mad|annoyed|furious/i,
  ],
  sad: [
    /难过|伤心|哭|委屈|孤独|失落|遗憾|累了|痛苦|抱歉|对不起|sad|sorry|lonely|tired|upset/i,
  ],
  surprised: [
    /哇|诶|欸|啊[？?]|什么[？?]|真的假的|居然|竟然|震惊|惊讶|surpris|wow/i,
  ],
  happy: [
    /哈哈|嘿嘿|开心|高兴|喜欢|太好了|可爱|棒|厉害|笑|happy|glad|love|nice|great/i,
  ],
  thinking: [
    /嗯|唔|让我想想|想想|可能|也许|大概|分析|推测|think|maybe|probably/i,
  ],
  attentive: [
    /知道了|明白|收到|好的|可以|当然|没问题|ok|okay|ready|sure/i,
  ],
};

const emotionPriority: EmotionScore[] = ['angry', 'sad', 'surprised', 'happy', 'thinking', 'attentive'];

export const neutralAvatarEmotionSignal: AvatarEmotionSignal = {
  emotion: 'neutral',
  gesture: 'none',
  confidence: 0.5,
  source: 'heuristic',
};

export function inferAvatarEmotionFromText(text: string): AvatarEmotionSignal {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return neutralAvatarEmotionSignal;
  }

  let bestEmotion: EmotionScore | null = null;
  let bestScore = 0;

  for (const emotion of emotionPriority) {
    const score = emotionKeywords[emotion].reduce(
      (total, pattern) => total + (pattern.test(normalizedText) ? 1 : 0),
      0,
    );

    if (score > bestScore) {
      bestEmotion = emotion;
      bestScore = score;
    }
  }

  if (!bestEmotion) {
    return neutralAvatarEmotionSignal;
  }

  return {
    emotion: bestEmotion,
    gesture: resolveGesture(bestEmotion),
    confidence: Math.min(0.9, 0.56 + bestScore * 0.08),
    source: 'heuristic',
  };
}

function resolveGesture(emotion: AvatarEmotion): AvatarGesture {
  switch (emotion) {
    case 'attentive':
      return 'nod';
    case 'thinking':
    case 'sad':
      return 'tilt';
    case 'happy':
      return 'bounce';
    case 'surprised':
      return 'recoil';
    case 'angry':
      return 'shake';
    case 'neutral':
      return 'none';
  }
}
