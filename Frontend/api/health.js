"use strict";

const {
  getRpcConfig,
  validateRpcConfig,
  getConfigDiagnostics,
  applyCors,
  isPreflight,
} = require("./_rpc");

module.exports = async function handler(req, res) {
  const cfg = getRpcConfig();
  applyCors(req, res, cfg);
  if (isPreflight(req)) {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const diagnostics = getConfigDiagnostics(cfg);
  try {
    validateRpcConfig(cfg);
    res.status(200).json({
      ok: true,
      diagnostics,
      message: "API config looks valid. If reads still fail, verify RPC endpoint availability and method names.",
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      diagnostics,
      error: err && err.message ? err.message : "invalid RPC configuration",
    });
  }
};
