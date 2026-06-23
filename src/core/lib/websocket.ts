export function createAuthenticatedWebSocket(url: string, headers: Record<string, string>): WebSocket {
  const WebSocketConstructor = globalThis.WebSocket as unknown as new (
    url: string,
    protocols?: string | string[],
    options?: { headers?: Record<string, string> },
  ) => WebSocket;

  return new WebSocketConstructor(url, [], { headers });
}

export function sendJson(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}
