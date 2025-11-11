# node-tcp-metrics

A small demo package that instruments Node TCP/TLS sockets to collect per-socket byte counts and global totals. Originally used to show how large MongoDB reads/writes appear at the socket level.

This package patches the built-in `net` and `tls` creators so sockets created by client connections and by `net.Server` are automatically instrumented.

## Features

- Per-socket totals (rx/tx) and a global total.
- Emits `socketSummary` events when sockets close.
- Patches `net.createConnection`, `tls.connect`, and `net.Server.prototype.emit('connection', ...)` so instrumentation is automatic for client and server sockets.

## Quick start

Prerequisites
- Node.js (tested on Node 18+)
- A MongoDB URI if you want to run the included demo script

Install dependencies

Open the package folder and run:

```bash
npm install
```

Run the demo

The demo (`src/index.ts`) expects a MongoDB URI:

```bash
MONGODB_URI="mongodb+srv://user:pass@host/?compressors=zlib" npm run dev
```
