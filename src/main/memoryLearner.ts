/**
 * memoryLearner.ts (main)
 * 对话结束后的记忆学习：用 assist 模型从转写里抽事实、压缩近期摘要，并入并落盘。
 * 对齐主项目「会话结束 → 抽取 + 压缩」的最小流程，去掉 signal/reflection/向量去重。best-effort，失败只记录不抛。
 */
import { chatCompletion } from './assistClient';
import { MemoryStore } from './memoryStore';
import type { AssistConfig } from './config';
import {
  buildFactExtractionPrompt,
  formatTranscript,
  parseExtractedFacts,
  type ConversationTurn,
} from '../core/memory/factExtraction';
import { buildRecentSummaryPrompt, parseSummary } from '../core/memory/recentSummary';
import { mergeFacts } from '../core/memory/mergeFacts';
import type { MemoryFact } from '../core/memory/types';

const MAX_FACTS = 200;
const MAX_RECENT_TURNS = 20;

export interface LearnParams {
  store: MemoryStore;
  assist: AssistConfig;
  turns: ConversationTurn[];
  lanlanName: string;
  masterName: string;
}

export async function learnFromConversation(params: LearnParams): Promise<void> {
  const { store, assist, turns, lanlanName, masterName } = params;
  const transcript = formatTranscript(turns, lanlanName, masterName);
  if (transcript === '') {
    return;
  }

  const snapshot = store.load();

  await extractAndStoreFacts(store, assist, transcript, lanlanName, masterName, snapshot.facts);
  await compressAndStoreRecent(store, assist, transcript, lanlanName, masterName, snapshot.recent.summary, turns);
}

async function extractAndStoreFacts(
  store: MemoryStore,
  assist: AssistConfig,
  transcript: string,
  lanlanName: string,
  masterName: string,
  existing: MemoryFact[],
): Promise<void> {
  try {
    const raw = await chatCompletion(assist, buildFactExtractionPrompt(transcript, lanlanName, masterName));
    const extracted = parseExtractedFacts(raw);
    if (extracted.length === 0) {
      return;
    }

    const stamp = Date.now();
    const iso = new Date(stamp).toISOString();
    const newFacts: MemoryFact[] = extracted.map((fact, index) => ({
      ...fact,
      id: `fact_${stamp}_${index}`,
      source: 'user_observation',
      createdAt: iso,
    }));

    store.saveFacts(mergeFacts(existing, newFacts, MAX_FACTS));
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[memory] 事实抽取失败：', error instanceof Error ? error.message : error);
  }
}

async function compressAndStoreRecent(
  store: MemoryStore,
  assist: AssistConfig,
  transcript: string,
  lanlanName: string,
  masterName: string,
  previousSummary: string,
  turns: ConversationTurn[],
): Promise<void> {
  try {
    const raw = await chatCompletion(
      assist,
      buildRecentSummaryPrompt(previousSummary, transcript, lanlanName, masterName),
    );
    const summary = parseSummary(raw);
    if (summary !== '') {
      store.saveRecent({ summary, turns: turns.slice(-MAX_RECENT_TURNS) });
    }
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error('[memory] 近期摘要压缩失败：', error instanceof Error ? error.message : error);
  }
}
