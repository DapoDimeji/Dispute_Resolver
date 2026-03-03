"use strict";

const {
  callRpcWithFallback,
  getRpcConfig,
  normalizeAddress,
  applyCors,
  isPreflight,
  enforceRateLimit,
  authorizeWrite,
} = require("./_rpc");

module.exports = async function handler(req, res) {
  const cfg = getRpcConfig();
  applyCors(req, res, cfg);
  if (isPreflight(req)) {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!enforceRateLimit(req, res, cfg, "write")) return;
  if (!authorizeWrite(req, cfg)) {
    res.status(401).json({ error: "Unauthorized write request" });
    return;
  }

  try {
    const body = req.body || {};
    const contractAddress = body.contractAddress;
    const functionName = body.functionName;
    const args = Array.isArray(body.args) ? body.args : [];
    const value = Number(body.value || 0);
    if (!contractAddress || !functionName) {
      res.status(400).json({ error: "contractAddress and functionName are required" });
      return;
    }

    const privateKey = process.env.GL_PRIVATE_KEY || "";
    const forwarded = cfg.trustClientFrom
      ? normalizeAddress(req.headers["x-gl-from"] || body.from || body.sender)
      : "";
    const from = forwarded || normalizeAddress(process.env.GL_FROM || "");
    if (!privateKey && !from) {
      res.status(500).json({
        error: "Missing signer configuration. Set GL_PRIVATE_KEY or GL_FROM in server env.",
      });
      return;
    }

    const result = await callRpcWithFallback(cfg.rpcUrl, cfg.writeMethods, () => ({
      address: contractAddress,
      functionName,
      args,
      value,
      from,
      sender: from,
      private_key: privateKey,
      privateKey,
      account: privateKey ? { privateKey } : undefined,
    }));

    res.status(200).json({ result });
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : "write failed",
    });
  }
};
