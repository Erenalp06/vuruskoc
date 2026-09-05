# Deploy — VuruşKoç

The app is a **static PWA**. All analysis runs in the browser (MediaPipe + the TS
engine); nothing is uploaded. Deploying = pushing `web/dist` to any HTTPS static host.
HTTPS is required (MediaPipe GPU, MediaRecorder, `crypto`, future camera all need a
secure context).

## Build

```bash
cd web
npm ci
npm run build        # -> web/dist  (uses NODE_OPTIONS=--experimental-global-webcrypto on Node 18)
```

Output includes the PWA service worker (`sw.js`, `workbox-*.js`), `manifest.webmanifest`,
icons, and `_headers` (COOP/COEP + cache rules — honored by Cloudflare Pages and Netlify).

Engine assets shipped in `web/public/` and copied to `dist/`:
`mediapipe/wasm/*` (~35 MB), `models/pose_landmarker_lite.task` (~5.7 MB), `drills/*.mp4`.
They're runtime-cached by the SW on first use, not precached, so first load stays light.

## Cloudflare Pages (recommended)

```bash
npm i -g wrangler
wrangler pages deploy web/dist --project-name vuruskoc
```

Or connect the Git repo in the Cloudflare dashboard:
- Build command: `npm --prefix web ci && npm --prefix web run build`
- Output directory: `web/dist`
- Node version: 20 (drop the `NODE_OPTIONS` flag then) or 18

Custom domain: Pages → project → Custom domains → add `vuruskoc.app` (or a subdomain).
`_headers` is applied automatically.

## Netlify

`netlify.toml` at repo root, or:
- Build command: `npm --prefix web ci && npm --prefix web run build`
- Publish directory: `web/dist`

`_headers` in the publish dir is applied automatically.

## Private beta on your own box (optional)

The repo's Go server (`server/`) already serves `web/dist`. To expose it with HTTPS
without port-forwarding:

```bash
# tailnet only (every user needs Tailscale):
tailscale serve https / http://localhost:8899

# public internet, real cert, no client install:
tailscale funnel 8899
# or:  cloudflared tunnel --url http://localhost:8899
```

Prefer the static host for anything beyond a handful of testers — the box doesn't do any
per-analysis work, so keeping it online just to serve files is wasteful.

## Notes

- `registerType: "autoUpdate"` — a new deploy silently updates the SW and refreshes.
- To wipe a client's cached engine assets after swapping the model: bump the runtime cache
  name in `vite.config.ts` (`vk-engine-assets` → `vk-engine-assets-2`).
- The optional sync backend (accounts, cross-device history) isn't built yet; when it is,
  host it separately (Fly.io / Railway / small VPS) and point the SPA at it via an env var.
