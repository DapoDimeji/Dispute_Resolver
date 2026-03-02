/*
  GenLayer Dispute Resolver - app.js
  Contract-compatible frontend logic
*/

function normalizeAddress(a) {
  if (!a) return a;
  a = String(a).toLowerCase();
  if (!a.startsWith('0x')) a = '0x' + a;
  return a;
}

function el(id) { return document.getElementById(id); }

function statusTag(status) {
  const map = {
    open: 'tag-open',
    voting: 'tag-voting',
    resolved: 'tag-resolved',
    appeal: 'tag-open'
  };
  return `<span class="tag ${map[status] || 'tag-open'}">${status}</span>`;
}

let GL = null;
let currentSender = null;
let selectedDisputeId = null;
let pollingIntervalId = null;
let toastId = 0;

function resolveClient() {
  return window.GenLayerContract || window.glClient || null;
}

function getClientMethod(method) {
  if (!GL) return null;
  if (typeof GL[method] === 'function') return GL[method].bind(GL);
  if (method === 'stake_as_juror' && typeof GL.stake_juror === 'function') return GL.stake_juror.bind(GL);
  return null;
}

async function callGL(method, payload) {
  const fn = getClientMethod(method);
  if (!fn) throw new Error(`Contract method not available: ${method}`);

  if (typeof payload === 'undefined') return await fn();

  try {
    if (currentSender) return await fn(payload, currentSender);
  } catch (_) {
    // Fallback for clients that do not accept sender arg.
  }
  return await fn(payload);
}

function updateStats(disputes) {
  const total = disputes.length;
  const openVoting = disputes.filter(d => d.status === 'open' || d.status === 'voting').length;
  const resolved = disputes.filter(d => d.status === 'resolved').length;

  if (el('statTotal')) el('statTotal').textContent = String(total);
  if (el('statOpen')) el('statOpen').textContent = String(openVoting);
  if (el('statResolved')) el('statResolved').textContent = String(resolved);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickTxHash(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('0x')) return value;
  if (typeof value !== 'object') return null;
  return (
    value.transaction_hash ||
    value.tx_hash ||
    value.txHash ||
    value.hash ||
    value.id ||
    null
  );
}

function pickTxStatus(value) {
  if (!value || typeof value !== 'object') return null;
  const status = value.status || value.state || value.consensus_status || null;
  return status ? String(status).toUpperCase() : null;
}

function isFinalizedTx(value) {
  return pickTxStatus(value) === 'FINALIZED';
}

async function queryTxStatus(txHash) {
  const probes = [
    ['get_transaction', (hash) => hash],
    ['getTransaction', (hash) => hash],
    ['get_transaction_status', (hash) => hash],
    ['getTxStatus', (hash) => hash],
    ['tx_status', (hash) => hash],
  ];

  for (const [name, buildArg] of probes) {
    const fn = getClientMethod(name);
    if (!fn) continue;
    try {
      const tx = await fn(buildArg(txHash));
      if (tx) return tx;
    } catch (_) {
      // Try next probe.
    }
  }
  return null;
}

async function waitForFinalized(writeResult, label = 'Transaction') {
  if (isFinalizedTx(writeResult)) return writeResult;

  const txHash = pickTxHash(writeResult);
  if (!txHash) {
    // Some clients only return after finalization and don't expose tx metadata.
    return writeResult;
  }

  const timeoutMs = 180000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tx = await queryTxStatus(txHash);
    if (isFinalizedTx(tx)) return tx;
    await sleep(1500);
  }

  throw new Error(`${label} is still not FINALIZED. Please wait and retry.`);
}

function showToast(text, type = 'info', duration = 3000) {
  const container = el('toastContainer');
  if (!container) return;

  const id = ++toastId;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.id = `toast-${id}`;
  toast.innerHTML = `<div>${text}</div>`;
  container.appendChild(toast);

  if (duration > 0) setTimeout(() => toast.remove(), duration);
}

async function connectWallet() {
  if (!window.ethereum) {
    showToast('MetaMask not detected', 'error');
    return;
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (accounts && accounts.length > 0) {
    currentSender = normalizeAddress(accounts[0]);
    if (el('connected')) el('connected').textContent = `${currentSender.slice(0, 6)}...${currentSender.slice(-4)}`;
    if (el('walletDot')) el('walletDot').classList.remove('off');
    showToast('Wallet connected', 'success');

    if (selectedDisputeId) await showDetails(selectedDisputeId);
  }
}

async function refreshList() {
  const list = el('disputesList');
  if (!list) return;

  try {
    const disputes = await callGL('get_all_disputes');
    const normalized = Array.isArray(disputes) ? disputes : [];
    updateStats(normalized);

    if (normalized.length === 0) {
      list.innerHTML = '<div class="empty">No disputes found</div>';
      return;
    }

    list.innerHTML = '';
    for (const d of normalized) {
      const id = d.id ?? d.dispute_id;
      const row = document.createElement('div');
      row.className = 'dispute-row floating-card';
      row.innerHTML = `
        <div style="flex:1">
          <div class="d-id">#${id}</div>
        </div>
        <div class="d-right">
          ${statusTag(d.status)}
          <button class="btn btn-ghost btn-sm">View</button>
        </div>`;

      const btn = row.querySelector('button');
      if (btn) btn.onclick = (e) => { e.stopPropagation(); showDetails(id); };
      row.onclick = () => showDetails(id);
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = `<div class="empty" style="color:red">${e.message}</div>`;
  }
}

async function showDetails(id) {
  selectedDisputeId = id;

  const card = el('detailsCard');
  const details = el('details');
  const voteArea = el('voteArea');
  if (!details || !voteArea) return;
  if (card) card.style.display = 'block';

  try {
    const d = await callGL('get_dispute', id);

    details.innerHTML = `
      <div class="detail-row"><span>ID</span><span>#${d.id ?? d.dispute_id}</span></div>
      <div class="detail-row"><span>Status</span><span>${statusTag(d.status)}</span></div>
      <div class="detail-row"><span>Creator</span><span>${d.creator}</span></div>
      <div class="detail-row"><span>Description</span><span>${d.description || '-'}</span></div>
      <div class="detail-row"><span>Stake</span><span>${d.stake}</span></div>
      <div class="detail-row"><span>Jurors</span>
        <span>${d.jurors && d.jurors.length ? d.jurors.join('<br>') : '-'}</span>
      </div>
      <div class="detail-row"><span>Votes</span>
        <span><pre>${JSON.stringify(d.votes, null, 2)}</pre></span>
      </div>
      ${d.resolution ? `<div class="detail-row"><span>Resolution</span><span style="color:green">${d.resolution}</span></div>` : ''}
    `;

    if (d.status === 'voting' && d.voting_deadline) {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(d.voting_deadline) - now;
      details.innerHTML += `
        <div class="detail-row">
          <span>Voting Deadline</span>
          <span>${remaining > 0 ? `${Math.floor(remaining / 60)} min remaining` : "<span style='color:red'>Voting Closed</span>"}</span>
        </div>`;
    }

    voteArea.innerHTML = '';
    if (!currentSender || d.status !== 'voting') return;

    const jurors = Array.isArray(d.jurors) ? d.jurors.map(normalizeAddress) : [];
    if (!jurors.includes(currentSender)) return;

    const alreadyVoted = d.votes && d.votes[currentSender];
    if (alreadyVoted) {
      voteArea.innerHTML = '<div>You already voted.</div>';
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (d.voting_deadline && now > Number(d.voting_deadline)) {
      voteArea.innerHTML = '<div style="color:red">Voting closed</div>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'vote-form floating-card';
    wrap.innerHTML = `
      <select id="voteChoice">
        <option value="">Select Vote</option>
        <option value="for">For</option>
        <option value="against">Against</option>
        <option value="abstain">Abstain</option>
      </select>
      <button class="btn btn-primary" id="voteBtn">Cast Vote</button>
    `;
    voteArea.appendChild(wrap);

    el('voteBtn').onclick = async () => {
      const choice = el('voteChoice').value;
      if (!['for', 'against', 'abstain'].includes(choice)) {
        showToast('Select valid vote option', 'error');
        return;
      }

      const btn = el('voteBtn');
      btn.disabled = true;
      btn.innerHTML = 'Submitting...';

      try {
        const writeResult = await callGL('cast_vote', { dispute_id: id, vote: choice });
        await waitForFinalized(writeResult, 'Vote transaction');
        showToast('Vote submitted', 'success');
        await refreshList();
        await showDetails(id);
      } catch (e) {
        showToast(e.message, 'error');
      }

      btn.disabled = false;
      btn.innerHTML = 'Cast Vote';
    };
  } catch (e) {
    details.innerHTML = `<div style="color:red">${e.message}</div>`;
  }
}

function startPolling() {
  if (pollingIntervalId) return;
  pollingIntervalId = setInterval(async () => {
    await refreshList();
    if (selectedDisputeId != null) await showDetails(selectedDisputeId);
  }, 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  GL = resolveClient();
  if (!GL) {
    showToast('GenLayer SDK not loaded.', 'error', 0);
    return;
  }

  // Keep old test harnesses compatible.
  window.glClient = GL;

  const connectBtn = el('connectBtn');
  if (connectBtn) connectBtn.onclick = connectWallet;

  const createBtn = el('createBtn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      if (!currentSender) {
        showToast('Connect wallet first', 'error');
        return;
      }

      const description = (el('desc')?.value || '').trim();
      const stake = Number(el('stake')?.value || 0);

      if (!description) {
        showToast('Enter dispute description', 'error');
        return;
      }
      if (!stake || stake <= 0) {
        showToast('Enter valid stake', 'error');
        return;
      }

      createBtn.disabled = true;
      createBtn.innerHTML = 'Creating...';

      try {
        const writeResult = await callGL('create_dispute', { description, stake });
        await waitForFinalized(writeResult, 'Create dispute transaction');

        const returnedDisputeId =
          (typeof writeResult === 'string' && writeResult) ||
          (writeResult && typeof writeResult === 'object' && (writeResult.dispute_id || writeResult.id)) ||
          null;

        showToast('Dispute created', 'success');
        if (el('desc')) el('desc').value = '';
        if (el('stake')) el('stake').value = '';
        await refreshList();
        if (returnedDisputeId) {
          await showDetails(returnedDisputeId);
        }
      } catch (e) {
        showToast(e.message, 'error');
      }

      createBtn.disabled = false;
      createBtn.innerHTML = 'Create Dispute';
    });
  }

  const stakeBtn = el('stakeBtn');
  if (stakeBtn) {
    stakeBtn.addEventListener('click', async () => {
      if (!currentSender) {
        showToast('Connect wallet first', 'error');
        return;
      }

      const amount = Number(el('stake')?.value || 0);
      if (!amount || amount <= 0) {
        showToast('Enter valid amount', 'error');
        return;
      }

      stakeBtn.disabled = true;
      stakeBtn.innerHTML = 'Staking...';

      try {
        const writeResult = await callGL('stake_as_juror', { amount });
        await waitForFinalized(writeResult, 'Stake transaction');
        showToast('Staked successfully', 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }

      stakeBtn.disabled = false;
      stakeBtn.innerHTML = 'Stake as Juror';
    });
  }

  refreshList();
  startPolling();
}, { once: true });
