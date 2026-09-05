// Node 18 lacks a global `crypto`; some build deps (serialize-javascript via
// workbox terser) need it. Node 20+ has it and this is a no-op there.
// Loaded via NODE_OPTIONS=--require in the build script.
if (!globalThis.crypto) {
  globalThis.crypto = require("node:crypto").webcrypto;
}
