import * as net from "net";
import * as tls from "tls";
import { createRequire } from "module";
import { EventEmitter } from "events";

export interface Totals {
  rx: number;
  tx: number;
}

export interface SocketStats extends Totals {
  label: string;
}

const metrics = {
  total: { rx: 0, tx: 0 } as Totals,
  // Keep per-socket stats so we can report totals per socket.
  // Note: switching from WeakMap to Map holds strong refs to sockets.
  bySocket: new Map<net.Socket, SocketStats>(),
  emitter: new EventEmitter(),
};

function labelForSocket(s: net.Socket): string {
  const addr = s.remoteAddress ?? "unconnected";
  const port = s.remotePort ?? 0;
  return `${addr}:${port}`;
}

function ensureSocketEntry(s: net.Socket): SocketStats {
  let st = metrics.bySocket.get(s);
  if (!st) {
    st = { rx: 0, tx: 0, label: labelForSocket(s) };
    metrics.bySocket.set(s, st);
  }
  return st;
}

function byteLengthOf(chunk: unknown): number {
  if (typeof chunk === "string") return Buffer.byteLength(chunk);
  if (Buffer.isBuffer(chunk)) return chunk.length;
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  if (chunk == null) return 0;
  // Fallback
  return Buffer.byteLength(String(chunk));
}

function instrumentSocket(s: net.Socket): void {
  // Count inbound bytes
  const onData = (chunk: unknown) => {
    const n = byteLengthOf(chunk);
    if (n > 0) {
      const st = ensureSocketEntry(s);
      st.rx += n;
      metrics.total.rx += n;
    }
  };
  s.on("data", onData);

  // Wrap write() to count outbound bytes
  const originalWrite = s.write;
    (s as any).write = function patchedWrite(chunk: any, ...rest: any[]) {
    const n = byteLengthOf(chunk);
    if (n > 0) {
      const st = ensureSocketEntry(s);
      st.tx += n;
      metrics.total.tx += n;
    }
    return originalWrite.call(this, chunk, ...rest);
  };

  // Relabel after connection is established (address becomes known)
  const relabel = () => {
    const st = ensureSocketEntry(s);
    const oldLabel = st.label;
    const newLabel = labelForSocket(s);
    if (newLabel !== oldLabel) {
      // Only update the socket's label; per-peer aggregates removed.
      st.label = newLabel;
    }
  };
  s.once("connect", relabel);
  // For TLS sockets:
  s.once?.("secureConnect", relabel);

  s.once("close", () => {
    const st = metrics.bySocket.get(s);
    if (st) metrics.emitter.emit("socketSummary", { ...st });
  });
}

/** Patch creators so new sockets are instrumented automatically (client + server). */
(function patchCreators() {
  // Use CommonJS require to obtain mutable built-in exports. The ESM module
  // namespace (`import * as net from 'node:net'`) is read-only, so assigning
  // directly to `net.createConnection` will throw in ESM contexts.
  const require = createRequire(import.meta.url);
  const netCjs = require("net") as typeof net;
  const tlsCjs = require("tls") as typeof tls;

  // Client sockets
  // Treat originals as `any` to avoid TypeScript overload/tuple spread issues
  // when forwarding arbitrary arg lists.
    const originalCreateConnection: any = netCjs.createConnection;
    netCjs.createConnection = function patchedCreateConnection(...args: any[]): net.Socket {
    const sock = originalCreateConnection.call(netCjs, ...args as any);
    instrumentSocket(sock);
    return sock;
  };

  // TLS client sockets
    const originalTlsConnect: any = tlsCjs.connect;
    (tlsCjs as any).connect = function patchedTlsConnect(...args: any[]) {
    const sock: tls.TLSSocket = originalTlsConnect.call(tlsCjs, ...args as any);
    instrumentSocket(sock);
    return sock;
  };

  // Server-accepted sockets
  const originalServerEmit: any = netCjs.Server.prototype.emit;
  netCjs.Server.prototype.emit = function patchedEmit(event: string, ...args: any[]) {
    if (event === "connection" && args[0] instanceof net.Socket) {
      instrumentSocket(args[0] as net.Socket);
    }
    return originalServerEmit.call(this, event, ...args);
  };
})();

/** Public API */
export function getTotals(): { total: Totals; sockets: SocketStats[] } {
  return {
    total: { ...metrics.total },
    sockets: [...metrics.bySocket.values()].map((s) => ({ ...s })),
  };
}

export function on(
  event: "socketSummary",
  listener: (s: SocketStats) => void
): EventEmitter {
  metrics.emitter.on(event, listener);
  return metrics.emitter;
}
