# { "Depends": "py-genlayer:test" }

import json
from dataclasses import dataclass, field

from genlayer import DynArray, TreeMap, allow_storage, gl, u64


@allow_storage
@dataclass
class JurorStake:
    staked: u64 = u64(0)
    locked: u64 = u64(0)


@allow_storage
@dataclass
class Vote:
    juror: str
    choice: str
    timestamp: u64


@allow_storage
@dataclass
class Dispute:
    dispute_id: str
    creator: str
    description: str
    stake: u64
    status: str
    assigned_jurors: DynArray[str] = field(default_factory=DynArray)
    votes: DynArray[Vote] = field(default_factory=DynArray)
    resolution: str = ""
    ai_explanation: str = ""
    created_at: u64 = u64(0)
    voting_deadline: u64 = u64(0)


class DisputeContract(gl.Contract):
    owner: str = ""
    next_dispute_id: u64 = u64(1)

    disputes: TreeMap[str, Dispute]
    jurors: TreeMap[str, JurorStake]
    balances: TreeMap[str, u64]

    min_stake: u64 = u64(100)
    juror_count: u64 = u64(3)
    voting_period: u64 = u64(86400)

    def __init__(self):
        # Keep constructor explicit for schema generation.
        # Do not reassign storage fields like TreeMap here.
        pass

    def _sender(self) -> str:
        return str(getattr(gl.message, "sender_address", ""))

    def _to_int(self, value, default: int = 0) -> int:
        try:
            return int(value)
        except Exception:
            return default

    def _normalize_dispute_id(self, dispute_id) -> str:
        if isinstance(dispute_id, int):
            return f"dispute_{dispute_id}"
        text = str(dispute_id)
        if text.isdigit():
            return f"dispute_{text}"
        return text

    def _require_balance(self, user: str, amount: int):
        if self._to_int(self.balances.get(user, u64(0))) < amount:
            raise Exception("Insufficient balance")

    def _serialize_dispute(self, d: Dispute):
        votes_map = {v.juror: v.choice for v in d.votes}
        num_id = d.dispute_id.split("dispute_")[-1]
        try:
            num_id = int(num_id)
        except Exception:
            pass

        return {
            "id": num_id,
            "dispute_id": d.dispute_id,
            "creator": d.creator,
            "description": d.description,
            "stake": int(d.stake),
            "status": d.status,
            "jurors": [j for j in d.assigned_jurors],
            "votes": votes_map,
            "resolution": d.resolution,
            "ai_explanation": d.ai_explanation,
            "created_at": int(d.created_at),
            "voting_deadline": int(d.voting_deadline),
        }

    @gl.public.write
    def initialize(self):
        if self.owner:
            raise Exception("Already initialized")
        self.owner = self._sender()

    @gl.public.write
    def deposit(self, amount: int):
        amount = self._to_int(amount)
        if amount <= 0:
            raise Exception("Invalid amount")

        caller = self._sender()
        self.balances[caller] = u64(self._to_int(self.balances.get(caller, u64(0))) + amount)

    @gl.public.write
    def stake_as_juror(self, amount: int):
        amount = self._to_int(amount)

        if amount < int(self.min_stake):
            raise Exception("Stake too small")

        caller = self._sender()
        self._require_balance(caller, amount)
        self.balances[caller] = u64(self._to_int(self.balances.get(caller, u64(0))) - amount)

        juror = self.jurors.get(caller, JurorStake())
        juror.staked = u64(self._to_int(juror.staked) + amount)
        self.jurors[caller] = juror

    @gl.public.write
    def create_dispute(self, description: str = "", stake: int = 0):
        stake = self._to_int(stake)

        if stake < int(self.min_stake):
            raise Exception("Stake too small")

        caller = self._sender()
        self._require_balance(caller, stake)
        self.balances[caller] = u64(self._to_int(self.balances.get(caller, u64(0))) - stake)

        dispute_id = f"dispute_{int(self.next_dispute_id)}"
        self.next_dispute_id = u64(int(self.next_dispute_id) + 1)

        self.disputes[dispute_id] = Dispute(
            dispute_id=dispute_id,
            creator=caller,
            description=(description or "").strip(),
            stake=u64(stake),
            status="voting",
            assigned_jurors=[],
            votes=[],
            created_at=u64(int(self.next_dispute_id) - 1),
            voting_deadline=u64(0),
        )

        return dispute_id

    @gl.public.write
    def cast_vote(self, dispute_id: str, vote: str = ""):
        did = self._normalize_dispute_id(dispute_id)
        dispute = self.disputes.get(did)
        if dispute is None:
            raise Exception("Invalid dispute")
        if dispute.status != "voting":
            raise Exception("Not voting stage")

        caller = self._sender()
        if any(v.juror == caller for v in dispute.votes):
            raise Exception("Already voted")
        if vote not in ["for", "against", "abstain", "A", "B"]:
            raise Exception("Invalid vote")

        dispute.votes.append(
            Vote(juror=caller, choice=vote, timestamp=u64(len(dispute.votes) + 1))
        )

        # Resolve once enough votes were cast.
        if len(dispute.votes) >= int(self.juror_count):
            self._finalize(dispute)

        self.disputes[did] = dispute

    def _finalize(self, dispute: Dispute):
        counts: dict[str, int] = {}
        for v in dispute.votes:
            counts[v.choice] = counts.get(v.choice, 0) + 1

        if not counts:
            dispute.status = "appeal"
            dispute.resolution = "Unclear"
            dispute.ai_explanation = "No votes submitted"
            return

        winners = sorted(counts.items(), key=lambda x: (-x[1], x[0]))
        if len(winners) > 1 and winners[0][1] == winners[1][1]:
            dispute.status = "appeal"
            dispute.resolution = "Unclear"
            dispute.ai_explanation = "Vote tie detected"
            return

        dispute.status = "resolved"
        dispute.resolution = winners[0][0]
        dispute.ai_explanation = f"Majority selected: {winners[0][0]}"

    @gl.public.view
    def get_dispute(self, dispute_id: str):
        did = self._normalize_dispute_id(dispute_id)
        dispute = self.disputes.get(did)
        if dispute is None:
            raise Exception("Not found")
        return self._serialize_dispute(dispute)

    @gl.public.view
    def get_all_disputes(self):
        # Deterministic ordering: avoid relying on TreeMap iteration order.
        items = []
        max_id = self._to_int(self.next_dispute_id, 1)
        i = 1
        while i < max_id:
            key = f"dispute_{i}"
            dispute = self.disputes.get(key)
            if dispute is not None:
                items.append(self._serialize_dispute(dispute))
            i += 1
        return items


GenLayerDisputeContract = DisputeContract
