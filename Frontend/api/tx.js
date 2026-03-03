"use strict";

const {
  callRpcWithFallback,
  getRpcConfig,
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
  if (!enforceRateLimit(req, res, cfg, "tx")) return;

  try {
    const body = req.body || {};
    const txHash = body.txHash || body.hash || body.transaction_hash;
    if (!txHash) {
      res.status(400).json({ error: "txHash is required" });
      return;
    }

    const result = await callRpcWithFallback(cfg.rpcUrl, cfg.txMethods, (methodName) => {
      if (methodName === "get_transaction" || methodName === "getTransaction") {
        return { hash: txHash, transaction_hash: txHash };
      }
      return { txId: txHash, hash: txHash, transaction_hash: txHash };
    });

    res.status(200).json({ result });
  } catch (err) {
    res.status(500).json({
      error: err && err.message ? err.message : "tx query failed",
    });
  }
};
