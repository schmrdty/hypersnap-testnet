# RFC: community-run Hypersnap testnet (validators and read nodes wanted)

## Summary

A Hypersnap testnet (`fc_network = Testnet`) has been running since 2026-11-17 with two
validators operated by the author. This RFC proposes running it as a shared operator
testnet: a place to rehearse node upgrades, validator set changes, native account
registration and API changes before mainnet. It asks for at least two more validators
and two read nodes in the first month, and sets the rules for joining, changing the
validator set, releases and resets.

## Motivation

1. Mainnet has no rehearsal space. On 2026-11-14 four patch releases shipped in one
   afternoon and operators learned of each one by watching other nodes.
2. A validator set change has never been rehearsed outside the project. The procedure
   (append a set with a future `effective_at`, every node pulls and restarts before it)
   deserves a place where a mistake costs nothing. The first attempt on this testnet
   halted the chain at the announced height because one node was restarted instead of
   recreated; the runbook now says so.
3. Fresh-network behavior is untested upstream. The first genesis exposed a bug: a lone
   validator commits block 1 with no shard witnesses and the block shard halts for good
   once a second validator validates (upstream issue https://github.com/farcasterorg/hypersnap/issues/88).

## Specification

| Parameter | Value |
|---|---|
| Network | `Testnet` (FarcasterNetwork 2); messages must be signed for network 2 |
| Shards | 0 (block), 1 and 2 (data) |
| Block time | 1 s (consensus default) |
| Genesis | 2026-11-17 about 16:45 UTC, second genesis |
| Genesis validators | testnet-0 and testnet-1 (keys in `validators.testnet.toml`) |
| Accounts | native registration from block 1 (`[consensus.native_registration.activation_heights]` all 0); no on-chain connectors; fnames disabled |
| Gossip topics | Hypersnap topics from block 1 (`[gossip.topic_cutovers]` all 0) |
| Discovery | `[gossip.discovery]` enabled, seeds listed in the network file; seeding grants nothing |
| Snapshots | none; nodes sync from block 1 (under a minute at current size) |
| Image | `farcasterorg/hypersnap:latest` (stable) |
| Network file | `validators.testnet.toml`, appended to every node's config at start |
| Public API | https://hst0.schmidtiest.xyz and https://hst1.schmidtiest.xyz |
| Health page | https://snapdiff.schmidtiest.xyz/?net=testnet |

## Procedure

### Joining

1. Clone https://github.com/schmrdty/hypersnap-testnet on the host. `./join.sh readnode` or `./join.sh validator`. The
   script generates the consensus key (validators), writes `.env` (mode 600) and
   `docker-compose.yml`, pulls the image, starts the node.
2. `./join.sh status` two minutes later: shards 0, 1, 2 climbing.
3. Operator issue from the template: public IP or DNS name, peer id, and for
   validators the consensus PUBLIC key. Secrets are never posted.

Read nodes are on the network as soon as they sync.

### Validator set changes

1. Candidates are batched. One pull request appends a `[[consensus.validator_sets]]`
   entry listing the full new set with an `effective_at` at least 48 hours ahead, and
   adds the new node's seed line.
2. Every operator runs `git pull && docker compose restart hypersnap` before the height
   (the network file is a bind mount; `restart` re-reads it). A node that changed its
   compose file or `.env` runs `docker compose up -d` instead.
3. At the height the new set takes over on all shards. A member that is absent at the
   height costs the network one of its tolerated failures: with N validators,
   floor((N-1)/3) may be down. Rehearsed timing: key generation to a running node about 10
   minutes; announcement to activation 27 minutes in rehearsal, 48 hours in operation.
4. Removal uses the same mechanism with the key left out.

### Releases

The testnet tracks the stable `latest` tag. A nightly window is announced in this
repo with a start, the image tag, and an end; after the end every node returns to
`latest`. Operators who miss a window are told, not removed.

### Resets

The chain may be restarted from a new genesis with seven days notice in this repo.
Nothing on the chain has value; all data is public and disposable.

## Governance

The author maintains `validators.testnet.toml` and this repo. Set changes are pull
requests with the height in the title; anyone can review. The upstream maintainer is
informed of every change and may veto anything that diverges from protocol rules. The
testnet makes no protocol decisions; it reports findings upstream as issues.

## Security considerations

1. Consensus keys are generated on the operator's host and never leave it; the repo
   ignores `.env` and `.pem`. The Docker image ships pre-generated devnet keys under
   `/app/nodes`; they are never used here.
2. Port 3383 (admin gRPC) stays on localhost; 3381 may be public or behind a TLS proxy;
   3382/udp must be reachable for gossip.
3. A misbehaving validator (spam, modified consensus code) is removed at the next
   batch. With few validators this is the only lever; it is stated up front.
4. Native registration is proof-of-work gated (22 bits today); abuse raises the
   difficulty upstream, not here.

## Open questions

1. Keep 1 s blocks or slow them down for validator load?
2. Cap the validator count at mainnet's eight?
3. Where do height announcements go: this repo's issues, a cast, Telegram, or all three?

## Contact

This repository's issues.
