/**
 * xiaozhiServer.ts (server)
 * 设备侧 WebSocket 服务器外壳：用 ws 起 server，把每个 socket 适配成 Transport，
 * 为每个连接装配 codec + 大脑 + XiaozhiConnection。不含智能，智能在注入的 VoiceBrain 里。
 */
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { XiaozhiConnection, type Transport, type VoiceBrain } from './connection';
import type { AudioCodec } from '../core/xiaozhi/audioCodec';

export interface XiaozhiServerOptions {
  port: number;
  codecFactory: () => AudioCodec;
  brainFactory: () => VoiceBrain;
}

export function startXiaozhiServer(options: XiaozhiServerOptions): WebSocketServer {
  const wss = new WebSocketServer({ port: options.port });
  let counter = 0;

  wss.on('connection', (socket: WebSocket) => {
    counter += 1;
    const sessionId = `sess_${Date.now()}_${counter}`;
    const transport = createTransport(socket);
    const connection = new XiaozhiConnection(sessionId, transport, options.codecFactory(), options.brainFactory());

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        connection.handleBinary(toUint8Array(data));
      } else {
        void connection.handleText(rawToString(data));
      }
    });

    socket.on('close', () => connection.close());
    socket.on('error', () => connection.close());
  });

  return wss;
}

function createTransport(socket: WebSocket): Transport {
  return {
    sendText: (text) => socket.send(text),
    sendBinary: (frame) => socket.send(frame),
  };
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  return Buffer.from(data as ArrayBuffer).toString('utf8');
}

function toUint8Array(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(data as ArrayBuffer);
}
