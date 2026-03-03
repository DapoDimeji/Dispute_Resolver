# GenLayer Dispute Resolver Deployment (No Browser SDK)

This project is deployed in no-SDK mode:
- Browser calls `window.glClient` from `genlayer-bridge.js`
- Bridge calls backend proxy endpoints under `/api/*`
- Backend proxy calls GenLayer RPC

## 1. Required runtime configuration

Configure frontend runtime values in `Frontend/index.html`:

```html
<script>
  window.__GL_CONFIG = {
    contractAddress: "0xYOUR_DEPLOYED_CONTRACT",
    apiBase: "/api",
    networkLabel: "production-proxy",
    // Optional:
    // writeAuthToken: "set-a-secret-token",
    // forwardSender: false
  };
</script>
```

`contractAddress` must be set per environment. Do not hardcode a stale address in JS source.

## 2. Backend environment variables

Required:
- `GL_RPC_URL` (example: `https://your-genlayer-rpc.example/api`)
- `GL_PRIVATE_KEY` or `GL_FROM`

Recommended for production:
- `GL_WRITE_AUTH_TOKEN` (required to call `/api/write`)
- `GL_ALLOWED_ORIGINS` (comma separated, example: `https://app.example.com`)
- `GL_RATE_LIMIT_PER_MIN` (default `120`)
- `GL_TRUST_CLIENT_FROM=1` only if your RPC supports trusted forwarded sender identity

Optional method override lists (comma-separated):
- `GL_READ_METHODS`
- `GL_WRITE_METHODS`
- `GL_TX_METHODS`

## 3. API endpoints used by frontend

- `POST /api/read`
- `POST /api/write`
- `POST /api/tx`

`/api/write` is protected by `GL_WRITE_AUTH_TOKEN` when configured.

## 4. Netlify deployment

`netlify.toml` is configured for this architecture:
- Publish static files from `Frontend`
- Build functions from `Frontend/api`
- Route `/api/*` to Netlify functions
- Route all other paths to `/index.html`

Deploy steps:
1. Connect repo to Netlify.
2. Set required environment variables in Site Settings.
3. Deploy and verify:
   - `GET /` loads app
   - `POST /api/read` returns contract data
   - Write calls are authorized and finalized

## 5. Vercel deployment

If deploying on Vercel:
1. Set project root to `Frontend`.
2. Keep `api/` in the same root so `api/*.js` are serverless functions.
3. Set the same environment variables as above.
4. Add SPA rewrite to `index.html` for non-API routes.

## 6. Production checklist

- [ ] `window.__GL_CONFIG.contractAddress` set to the deployed instance
- [ ] `GL_RPC_URL` points to production RPC
- [ ] `GL_WRITE_AUTH_TOKEN` set and used by frontend or gateway
- [ ] `GL_ALLOWED_ORIGINS` restricted to known domains
- [ ] Rate limiting active (`GL_RATE_LIMIT_PER_MIN`)
- [ ] No private keys exposed client-side
- [ ] Writes observed as `FINALIZED` before next dependent action
- [ ] `?test=1` smoke test passes in browser console

## 7. Notes on signer model

Contract logic uses on-chain sender identity (`gl.message.sender_address`).
In proxy mode, effective sender behavior depends on your RPC/signing setup:
- If using server key only, writes are effectively custodial.
- If using trusted forwarded sender (`GL_TRUST_CLIENT_FROM=1`), ensure your RPC validates sender semantics.

Choose and document your signer model before mainnet production.
