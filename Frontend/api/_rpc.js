"use strict";

const DEFAULT_RPC_URL = "http://localhost:4000/api";
const DEFAULT_RATE_LIMIT_PER_MIN = 120;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DEFAULT_RPC_TIMEOUT_MS = 12000;

function parseList(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_RPC_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err && err.name === "AbortError"
      ? `RPC request timed out after ${DEFAULT_RPC_TIMEOUT_MS}ms (${url})`
      : `RPC fetch failed (${url}): ${err && err.message ? err.message : String(err)}`;
    throw new Error(msg);
  } finally {
    clearTimeout(timeout);
  }
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = payload && (payload.error || payload.message);
    throw new Error(message || ("RPC HTTP error: " + resp.status));
  }
  return payload;
}

async function callRpc(rpcUrl, method, params) {
  const payload = await postJson(rpcUrl, {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  });
  if (payload && payload.error) {
    const detail = typeof payload.error === "string"
      ? payload.error
      : (payload.error.message || JSON.stringify(payload.error));
    throw new Error(detail);
  }
  return payload ? payload.result : null;
}

async function callRpcWithFallback(rpcUrl, methods, paramsFactory) {
  const errors = [];
  for (const method of methods) {
    const params = typeof paramsFactory === "function" ? paramsFactory(method) : paramsFactory;
    try {
      return await callRpc(rpcUrl, method, params);
    } catch (err) {
      errors.push(method + ": " + (err && err.message ? err.message : String(err)));
    }
  }
  throw new Error("No RPC method matched. Tried: " + errors.join(" | "));
}

function getRpcConfig() {
  return {
    rpcUrl: process.env.GL_RPC_URL || DEFAULT_RPC_URL,
    network: process.env.GL_NETWORK || "local",
    writeAuthToken: process.env.GL_WRITE_AUTH_TOKEN || "",
    allowedOrigins: parseList(process.env.GL_ALLOWED_ORIGINS, []),
    trustClientFrom: process.env.GL_TRUST_CLIENT_FROM === "1",
    rateLimitPerMin: Number(process.env.GL_RATE_LIMIT_PER_MIN || DEFAULT_RATE_LIMIT_PER_MIN),
    readMethods: parseList(
      process.env.GL_READ_METHODS,
      ["read_contract", "readContract", "call_contract", "callContract"]
    ),
    writeMethods: parseList(
      process.env.GL_WRITE_METHODS,
      ["write_contract", "writeContract", "send_contract_transaction", "sendContractTransaction"]
    ),
    txMethods: parseList(
      process.env.GL_TX_METHODS,
      ["get_transaction_receipt", "getTransactionReceipt", "get_transaction", "getTransaction"]
    ),
  };
}

function isLikelyLocalUrl(url) {
  if (!url) return false;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(url));
}

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY
  );
}

function validateRpcConfig(cfg) {
  const rpcUrl = String((cfg && cfg.rpcUrl) || "").trim();
  if (!rpcUrl) {
    throw new Error("Missing GL_RPC_URL. Set a reachable GenLayer RPC endpoint.");
  }

  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new Error("Invalid GL_RPC_URL. It must start with http:// or https://");
  }

  if (isServerlessRuntime() && isLikelyLocalUrl(rpcUrl)) {
    throw new Error(
      "GL_RPC_URL points to localhost, which is unreachable from serverless runtime. Set GL_RPC_URL to a public RPC endpoint."
    );
  }
}

function getConfigDiagnostics(cfg) {
  const rpcUrl = String((cfg && cfg.rpcUrl) || "");
  return {
    runtime: process.env.VERCEL ? "vercel" : (process.env.NETLIFY ? "netlify" : "unknown"),
    hasRpcUrl: Boolean(rpcUrl),
    rpcUrlLooksLocal: isLikelyLocalUrl(rpcUrl),
    hasSigner: Boolean(process.env.GL_PRIVATE_KEY || process.env.GL_FROM),
    hasWriteAuthToken: Boolean(process.env.GL_WRITE_AUTH_TOKEN),
  };
}

function txStatusUpper(value) {
  const raw = value && (value.status || value.state || value.consensus_status);
  return raw ? String(raw).toUpperCase() : "";
}

function normalizeAddress(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const addr = raw.startsWith("0x") ? raw : ("0x" + raw);
  return ADDRESS_RE.test(addr) ? addr.toLowerCase() : "";
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) {
    return fwd.split(",")[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : "unknown";
}

function getRateMap() {
  if (!globalThis.__glRateMap) {
    globalThis.__glRateMap = new Map();
  }
  return globalThis.__glRateMap;
}

function enforceRateLimit(req, res, cfg, scope) {
  const max = Number(cfg.rateLimitPerMin || DEFAULT_RATE_LIMIT_PER_MIN);
  if (!Number.isFinite(max) || max <= 0) return true;

  const nowMin = Math.floor(Date.now() / 60000);
  const key = [scope || "global", getClientIp(req), nowMin].join(":");
  const bucket = getRateMap();
  const count = (bucket.get(key) || 0) + 1;
  bucket.set(key, count);
  if (count <= max) return true;

  res.status(429).json({ error: "Rate limit exceeded" });
  return false;
}

function applyCors(req, res, cfg) {
  const origin = req.headers.origin;
  const allowed = cfg.allowedOrigins || [];

  if (allowed.length === 0 && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  if (origin) {
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, x-gl-from");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function isPreflight(req) {
  return req.method === "OPTIONS";
}

function authorizeWrite(req, cfg) {
  if (!cfg.writeAuthToken) return true;

  const auth = req.headers.authorization || "";
  const apiKey = req.headers["x-api-key"] || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return bearer === cfg.writeAuthToken || String(apiKey) === cfg.writeAuthToken;
}

module.exports = {
  callRpc,
  callRpcWithFallback,
  getRpcConfig,
  validateRpcConfig,
  getConfigDiagnostics,
  txStatusUpper,
  normalizeAddress,
  applyCors,
  isPreflight,
  enforceRateLimit,
  authorizeWrite,
};
