/*
  GenLayer Bridge
  Connects browser app to deployed contract (testnet/local configurable)
*/

(function () {
  if (window.GenLayerContract) return;

  const CONFIG = {
    network: "local",
    endpoint: "http://localhost:4000/api",
    contractAddress: "0x976De90EDD30807e5c03B7e310dD7d0DF89dc672",
  };

  let clientPromise = null;
  let contractPromise = null;

  function setNetworkBadge(text, state) {
    const nameEl = document.getElementById("networkName");
    const dotEl = document.getElementById("networkDot");
    if (nameEl) nameEl.textContent = text;
    if (dotEl) {
      dotEl.classList.remove("ok", "warn", "off");
      dotEl.classList.add(state || "off");
    }
  }

  function pickFactory() {
    if (window.GenLayer && typeof window.GenLayer.create === "function") {
      return { type: "genlayer-create", fn: window.GenLayer.create.bind(window.GenLayer) };
    }

    if (typeof window.createClient === "function") {
      return { type: "create-client", fn: window.createClient };
    }

    if (window.genlayer && typeof window.genlayer.createClient === "function") {
      return { type: "create-client", fn: window.genlayer.createClient.bind(window.genlayer) };
    }

    if (window.GenLayer && typeof window.GenLayer.createClient === "function") {
      return { type: "create-client", fn: window.GenLayer.createClient.bind(window.GenLayer) };
    }

    return null;
  }

  async function createClientFromFactory(factory) {
    if (factory.type === "genlayer-create") {
      try {
        return await factory.fn({ network: CONFIG.network, url: CONFIG.endpoint });
      } catch (_) {
        try {
          return await factory.fn({ network: CONFIG.network });
        } catch (__ ) {
          return await factory.fn({ endpoint: CONFIG.endpoint });
        }
      }
    }

    try {
      return await factory.fn({ endpoint: CONFIG.endpoint, network: CONFIG.network });
    } catch (_) {
      return await factory.fn({ endpoint: CONFIG.endpoint });
    }
  }

  async function getClient() {
    if (clientPromise) return clientPromise;

    const factory = pickFactory();
    if (!factory) {
      throw new Error("GenLayer SDK not loaded. Add a browser SDK bundle before genlayer-bridge.js.");
    }

    clientPromise = createClientFromFactory(factory);
    return clientPromise;
  }

  async function getContract() {
    if (contractPromise) return contractPromise;

    const client = await getClient();

    if (typeof client.contract === "function") {
      contractPromise = client.contract(CONFIG.contractAddress);
      return contractPromise;
    }

    throw new Error("SDK client does not expose client.contract(address)");
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

  async function waitFinalized(client, txHash) {
    if (!txHash) return null;

    if (typeof client.waitForTransactionReceipt === "function") {
      const receipt = await client.waitForTransactionReceipt({
        transaction_hash: txHash,
        hash: txHash,
        status: "FINALIZED",
      });
      return normalizeReceipt(txHash, receipt);
    }

    if (typeof client.getTransactionReceipt === "function") {
      for (;;) {
        const receipt = await client.getTransactionReceipt({
          txId: txHash,
          hash: txHash,
          transaction_hash: txHash,
        });
        const status = String(
          (receipt && (receipt.status || receipt.state || receipt.consensus_status)) || ""
        ).toUpperCase();
        if (status === "FINALIZED") return normalizeReceipt(txHash, receipt);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (typeof client.getTransaction === "function") {
      for (;;) {
        const tx = await client.getTransaction({ hash: txHash, transaction_hash: txHash });
        const status = String(
          (tx && (tx.status || tx.state || tx.consensus_status)) || ""
        ).toUpperCase();
        if (status === "FINALIZED") return normalizeReceipt(txHash, tx);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    return { transaction_hash: txHash, status: "ACCEPTED", raw: null };
  }

  async function callMethod(methodName, args) {
    const contract = await getContract();
    const fn = contract && contract[methodName];
    if (typeof fn !== "function") {
      throw new Error("Contract method not available: " + methodName);
    }
    return await fn(...(args || []));
  }

  async function writeMethod(methodName, args) {
    const client = await getClient();
    const result = await callMethod(methodName, args);
    const txHash = pickTxHash(result);
    if (!txHash) return result;
    const receipt = await waitFinalized(client, txHash);
    return receipt || result;
  }

  window.GenLayerContract = {
    async get_all_disputes() {
      return await callMethod("get_all_disputes", []);
    },

    async get_dispute(arg) {
      const disputeId = typeof arg === "object" && arg ? arg.dispute_id : arg;
      return await callMethod("get_dispute", [disputeId]);
    },

    async initialize() {
      return await writeMethod("initialize", []);
    },

    async deposit(args) {
      const amount = args && typeof args === "object" ? Number(args.amount) : Number(args);
      return await writeMethod("deposit", [amount]);
    },

    async stake_as_juror(args) {
      const amount = args && typeof args === "object" ? Number(args.amount) : Number(args);
      return await writeMethod("stake_as_juror", [amount]);
    },

    async create_dispute(args) {
      const description = args && typeof args === "object" ? String(args.description || "") : "";
      const stake = args && typeof args === "object" ? Number(args.stake || 0) : 0;
      return await writeMethod("create_dispute", [description, stake]);
    },

    async cast_vote(args) {
      const disputeId = String(args && args.dispute_id ? args.dispute_id : "");
      const vote = String(args && args.vote ? args.vote : "");
      return await writeMethod("cast_vote", [disputeId, vote]);
    },

    async get_transaction(txHash) {
      const client = await getClient();

      if (typeof client.getTransactionReceipt === "function") {
        const receipt = await client.getTransactionReceipt({
          txId: txHash,
          hash: txHash,
          transaction_hash: txHash,
        });
        return normalizeReceipt(txHash, receipt);
      }

      if (typeof client.getTransaction === "function") {
        const tx = await client.getTransaction({ hash: txHash, transaction_hash: txHash });
        return normalizeReceipt(txHash, tx);
      }

      return { transaction_hash: txHash, status: "ACCEPTED", raw: null };
    },
  };

  window.glClient = window.GenLayerContract;
  setNetworkBadge(CONFIG.network, "ok");
  console.log("GenLayer bridge ready:", CONFIG.network);
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