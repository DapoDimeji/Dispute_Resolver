/*
  GenLayer bridge for Frontend/app.js
  Exposes window.GenLayerContract with methods expected by the UI.

  Prerequisite:
  - A GenLayer JS SDK must be loaded on the page and expose createClient
    via one of:
      window.createClient
      window.genlayer.createClient
      window.GenLayer.createClient
*/

(function () {
  if (window.GenLayerContract) return;

  const CONTRACT_ADDRESS = "0x231CdB2C55fDFc3D9BfC661080D0F7676E10819d";
  const RPC_URL = "http://localhost:4000/api";

  let clientPromise = null;

  function pickCreateClient() {
    if (typeof window.createClient === "function") return window.createClient;
    if (window.genlayer && typeof window.genlayer.createClient === "function") {
      return window.genlayer.createClient.bind(window.genlayer);
    }
    if (window.GenLayer && typeof window.GenLayer.createClient === "function") {
      return window.GenLayer.createClient.bind(window.GenLayer);
    }
    return null;
  }

  function getClient() {
    if (clientPromise) return clientPromise;
    const createClient = pickCreateClient();
    if (!createClient) {
      throw new Error(
        "GenLayer SDK not found. Load SDK first, then genlayer-bridge.js."
      );
    }

    clientPromise = Promise.resolve(
      createClient({
        endpoint: RPC_URL,
      })
    );
    return clientPromise;
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
      while (true) {
        const receipt = await client.getTransactionReceipt({
          txId: txHash,
          hash: txHash,
          transaction_hash: txHash,
        });
        const status = String(
          (receipt && (receipt.status || receipt.state || receipt.consensus_status)) || ""
        ).toUpperCase();
        if (status === "FINALIZED") return normalizeReceipt(txHash, receipt);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    return { transaction_hash: txHash, status: "ACCEPTED", raw: null };
  }

  async function readContract(functionName, args) {
    const client = await getClient();
    if (typeof client.readContract !== "function") {
      throw new Error("SDK client does not implement readContract");
    }
    return await client.readContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args: args || [],
    });
  }

  async function writeContract(functionName, args) {
    const client = await getClient();
    if (typeof client.writeContract !== "function") {
      throw new Error("SDK client does not implement writeContract");
    }

    const txHash = await client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args: args || [],
      value: 0,
    });

    const receipt = await waitFinalized(client, txHash);

    // Keep dispute_id when SDK returns method result directly.
    if (functionName === "create_dispute" && typeof txHash === "string" && txHash.startsWith("dispute_")) {
      return txHash;
    }

    return receipt || txHash;
  }

  window.GenLayerContract = {
    async get_all_disputes() {
      return await readContract("get_all_disputes", []);
    },

    async get_dispute(arg) {
      const disputeId = typeof arg === "object" && arg ? arg.dispute_id : arg;
      return await readContract("get_dispute", [disputeId]);
    },

    async initialize() {
      return await writeContract("initialize", []);
    },

    async deposit(args) {
      const amount = args && typeof args === "object" ? Number(args.amount) : Number(args);
      return await writeContract("deposit", [amount]);
    },

    async stake_as_juror(args) {
      const amount = args && typeof args === "object" ? Number(args.amount) : Number(args);
      return await writeContract("stake_as_juror", [amount]);
    },

    async create_dispute(args) {
      const description = args && typeof args === "object" ? String(args.description || "") : "";
      const stake = args && typeof args === "object" ? Number(args.stake || 0) : 0;
      return await writeContract("create_dispute", [description, stake]);
    },

    async cast_vote(args) {
      const disputeId = String(args && args.dispute_id ? args.dispute_id : "");
      const vote = String(args && args.vote ? args.vote : "");
      return await writeContract("cast_vote", [disputeId, vote]);
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
})();
