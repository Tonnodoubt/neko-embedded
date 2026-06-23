/**
 * protocol.test.ts
 * 小智协议解析与消息构造的单测。
 */
import { describe, expect, it } from 'vitest';
import {
  buildLlm,
  buildServerHello,
  buildTtsSentenceStart,
  parseClientMessage,
  SERVER_OUTPUT_AUDIO,
} from './protocol';

describe('parseClientMessage', () => {
  it('parses a hello message', () => {
    const msg = parseClientMessage('{"type":"hello","version":1,"transport":"websocket"}');
    expect(msg).toEqual({ type: 'hello', version: 1, transport: 'websocket' });
  });

  it('parses listen with state and mode', () => {
    const msg = parseClientMessage('{"type":"listen","state":"start","mode":"manual","session_id":"s1"}');
    expect(msg).toMatchObject({ type: 'listen', state: 'start', mode: 'manual', session_id: 's1' });
  });

  it('maps unknown types to unknown', () => {
    const msg = parseClientMessage('{"type":"mcp","payload":{}}');
    expect(msg?.type).toBe('unknown');
  });

  it('returns null on invalid JSON or non-object', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('42')).toBeNull();
  });
});

describe('server message builders', () => {
  it('builds a server hello with 24k output audio params', () => {
    const hello = JSON.parse(buildServerHello('sess-1'));
    expect(hello).toMatchObject({ type: 'hello', transport: 'websocket', session_id: 'sess-1' });
    expect(hello.audio_params).toEqual(SERVER_OUTPUT_AUDIO);
    expect(hello.audio_params.sample_rate).toBe(24000);
  });

  it('builds llm emotion and tts sentence messages', () => {
    expect(JSON.parse(buildLlm('s', 'happy'))).toMatchObject({ type: 'llm', emotion: 'happy' });
    const sentence = JSON.parse(buildTtsSentenceStart('s', '你好'));
    expect(sentence).toMatchObject({ type: 'tts', state: 'sentence_start', text: '你好' });
  });
});
