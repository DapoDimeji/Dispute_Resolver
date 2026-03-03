"use strict";

const {
  callRpcWithFallback,
  getRpcConfig,
  validateRpcConfig,
  applyCors,
  isPreflight,
  enforceRateLimit,
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
  if (!enforceRateLimit(req, res, cfg, "read")) return;

  try {
    const body = req.body || {};
    const contractAddress = body.contractAddress;
    const functionName = body.functionName;
    const args = Array.isArray(body.args) ? body.args : [];
    if (!contractAddress || !functionName) {
      res.status(400).json({ error: "contractAddress and functionName are required" });
      return;
    }

    validateRpcConfig(cfg);
    const result = await callRpcWithFallback(cfg.rpcUrl, cfg.readMethods, () => ({
      address: contractAddress,
      functionName,
      args,
    }));

    res.status(200).json({ result });
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : "read failed",
    });
  }
};
