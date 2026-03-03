/*
  GenLayer Bridge (No Browser SDK)
  Uses backend API proxy endpoints under /api/*.
*/

(async function () {
  if (window.GenLayerContract) return;

  const runtimeConfig = window.__GL_CONFIG || {};
  const contractMeta = document.querySelector('meta[name="gl-contract-address"]');

  const CONFIG = {
    networkLabel: runtimeConfig.networkLabel || "proxy",
    contractAddress: runtimeConfig.contractAddress || (contractMeta ? contractMeta.content : ""),
    apiBase: runtimeConfig.apiBase || "/api",
    writeAuthToken: runtimeConfig.writeAuthToken || "",
    forwardSender: Boolean(runtimeConfig.forwardSender),
    txFinalizeTimeoutMs: 180000,
    txPollIntervalMs: 1500,
  };
  let currentSender = null;

  function setNetworkBadge(text, state) {
    const nameEl = document.getElementById("networkName");
    const dotEl = document.getElementById("networkDot");
    if (nameEl) nameEl.textContent = text;
    if (dotEl) {
      dotEl.classList.remove("ok", "warn", "off");
      dotEl.classList.add(state || "off");
    }
  }

  async function apiPost(path, body) {
    const headers = { "Content-Type": "application/json" };
    if (CONFIG.writeAuthToken) {
      headers.Authorization = "Bearer " + CONFIG.writeAuthToken;
    }
    if (CONFIG.forwardSender && currentSender) {
      headers["x-gl-from"] = currentSender;
    }

    const resp = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });

    const payload = await resp.json().catch(function () { return {}; });
    if (!resp.ok || (payload && payload.error)) {
      const message = (payload && payload.error) || ("Request failed: " + resp.status);
      throw new Error(message);
    }
    return payload.result;
  }

  function pickTxHash(value) {
    if (!value) return null;
    if (typeof value === "string" && value.startsWith("0x")) return value;
    if (typeof value !== "object") return null;
    return (
      value.transaction_hash ||
      value.tx_hash ||
      value.txHash ||
      value.hash ||
      value.id ||
      null
    );
  }

  function normalizeReceipt(txHash, receipt) {
    const statusRaw =
      (receipt && (receipt.status || receipt.state || receipt.consensus_status)) ||
      "FINALIZED";

    return {
      transaction_hash: txHash,
      status: String(statusRaw).toUpperCase(),
      raw: receipt || null,
    };
  }

  async function waitFinalized(txHash) {
    if (!txHash) return null;
    const startedAt = Date.now();

    while (Date.now() - startedAt < CONFIG.txFinalizeTimeoutMs) {
      const tx = await apiPost(CONFIG.apiBase + "/tx", { txHash: txHash });
      const status = String(
        (tx && (tx.status || tx.state || tx.consensus_status)) || ""
      ).toUpperCase();
      if (status === "FINALIZED") {
        return normalizeReceipt(txHash, tx);
      }
      await new Promise(function (resolve) { setTimeout(resolve, CONFIG.txPollIntervalMs); });
    }

    throw new Error("Transaction not FINALIZED yet. Please retry shortly.");
  }

  async function readMethod(functionName, args) {
    return await apiPost(CONFIG.apiBase + "/read", {
      contractAddress: CONFIG.contractAddress,
      functionName: functionName,
      args: args || [],
    });
  }

  async function writeMethod(functionName, args) {
    const result = await apiPost(CONFIG.apiBase + "/write", {
      contractAddress: CONFIG.contractAddress,
      functionName: functionName,
      args: args || [],
      value: 0,
    });

    const txHash = pickTxHash(result);
    if (!txHash) return result;
    const receipt = await waitFinalized(txHash);
    return receipt || result;
  }

  function normalizeAddress(a) {
    if (!a) return null;
    const raw = String(a).toLowerCase();
    const prefixed = raw.startsWith("0x") ? raw : ("0x" + raw);
    return /^0x[a-f0-9]{40}$/.test(prefixed) ? prefixed : null;
  }

  function setSender(sender) {
    const normalized = normalizeAddress(sender);
    if (normalized) currentSender = normalized;
  }

  const bridge = {
    async get_all_disputes(_args, sender) {
      setSender(sender);
      return await readMethod("get_all_disputes", []);
    },

    async get_dispute(arg, sender) {
      setSender(sender);
      const disputeId = typeof arg === "object" && arg ? arg.dispute_id : arg;
      return await readMethod("get_dispute", [disputeId]);
    },

    async initialize(_args, sender) {
      setSender(sender);
      return await writeMethod("initialize", []);
    },

    async deposit(args, sender) {
      setSender(sender);
      const amount = args && typeof args === "object" ? Number(args.amount) : Number(args);
      return await writeMethod("deposit", [amount]);
    },

    async stake_as_juror(args, sender) {
      setSender(sender);
      const amount = args && typeof args === "object" ? Number(args.amount) : Number(args);
      return await writeMethod("stake_as_juror", [amount]);
    },

    async create_dispute(args, sender) {
      setSender(sender);
      const description = args && typeof args === "object" ? String(args.description || "") : "";
      const stake = args && typeof args === "object" ? Number(args.stake || 0) : 0;
      return await writeMethod("create_dispute", [description, stake]);
    },

    async cast_vote(args, sender) {
      setSender(sender);
      const disputeId = String(args && args.dispute_id ? args.dispute_id : "");
      const vote = String(args && args.vote ? args.vote : "");
      return await writeMethod("cast_vote", [disputeId, vote]);
    },

    async get_transaction(txHash, sender) {
      setSender(sender);
      const tx = await apiPost(CONFIG.apiBase + "/tx", { txHash: txHash });
      return normalizeReceipt(txHash, tx);
    },
  };

  if (!CONFIG.contractAddress) {
    throw new Error(
      "Missing contract address. Set window.__GL_CONFIG.contractAddress or meta[name='gl-contract-address']."
    );
  }

  window.GenLayerContract = bridge;
  window.glClient = bridge;
  setNetworkBadge(CONFIG.networkLabel, "ok");
  console.log("GenLayer bridge ready:", CONFIG.networkLabel);
})().catch(function (err) {
  const nameEl = document.getElementById("networkName");
  const dotEl = document.getElementById("networkDot");
  if (nameEl) nameEl.textContent = "bridge error";
  if (dotEl) {
    dotEl.classList.remove("ok", "warn", "off");
    dotEl.classList.add("warn");
  }
  console.error("GenLayer bridge failed:", err);
});
