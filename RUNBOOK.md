# Hypersnap testnet operator runbook

Status of this document: WRITTEN as of 2026-11-16. It becomes TESTED when the
rehearsal in `docs/rehearsal-2026-11.md` has run every section with output shown.
Until then treat each step as a draft.

## 1. What this network is

| Item | Value |
|---|---|
| Protocol | Hypersnap (farcasterorg/hypersnap), image `farcasterorg/hypersnap:latest` |
| `fc_network` | `Testnet` (FarcasterNetwork value 2); messages must be signed for network 2 |
| Shards | 0 (block shard), 1 and 2 (data shards), same layout as mainnet |
| Accounts | Native registration from block 1: an account is created with a custody proof of work, no contract, FIDs start at 2^32 |
| Chain data imported | None. No L1 or L2 RPC, fnames disabled |
| Snapshots | None. Every node syncs from block 1; the chain is small |
| Network file | `validators.testnet.toml` in this repo, appended to every node's config at start |
| Genesis validators | testnet-0 (`https://hst0.schmidtiest.xyz`) and testnet-1 (`https://hst1.schmidtiest.xyz`), one dedicated server; addresses and peer ids in `validators.testnet.toml` |
| Health page | https://snapdiff.schmidtiest.xyz/?net=testnet |

## 2. Minimums

| Role | CPU | RAM | Disk | Network |
|---|---|---|---|---|
| Read node | 2 vCPU | 4 GB | 50 GB SSD | UDP 3382 reachable from the internet, TCP 3381 if you want your API public |
| Validator | 4 vCPU | 8 GB | 100 GB SSD | Static IPv4, UDP 3382 and TCP 3381 open, expected online all the time |

Open ports with your firewall before starting: `ufw allow 3381/tcp && ufw allow 3382/udp`.
Port 3383 (gRPC admin) is bound to localhost by the compose files and stays closed. If you put Caddy or another TLS proxy in front of the HTTP API, change the `3381:3381/tcp` mapping to `127.0.0.1:3381:3381/tcp` and recreate with `docker compose up -d`; UDP 3382 never goes through the proxy.

## 3. Join

1. `git clone <repo url> && cd hypersnap-testnet`
2. Read node: `./join.sh readnode`. Validator: `./join.sh validator`.
   The script asks for your public IPv4, writes `.env` (mode 600) and
   `docker-compose.yml`, pulls the image and starts the node.
3. After two minutes: `./join.sh status`. Heights on shards 0, 1 and 2 must climb.
4. Open an operator issue from the template with your public IP, peer id, and, for
   validators, the consensus PUBLIC key the script printed. Never post the private
   key, the `.env`, or the `.pem`.

A validator whose key is not yet in a validator set runs as a read node until the
announced height; nothing else changes on your side.

## 4. Validator set changes

Changes are batched. Each batch is one pull request to `validators.testnet.toml`
that appends a `[[consensus.validator_sets]]` entry with an `effective_at` height
announced at least 48 hours ahead, plus a discovery seed line for the new node.

Every operator, before the height:

```
git pull && docker compose restart hypersnap && ./join.sh status
```

A node that misses the height keeps running the old set and stops following the
chain at that height; the fix is the same command. Quorum math: with N validators,
floor((N-1)/3) may be offline at once. 1 validator tolerates 0, 4 tolerate 1,
7 tolerate 2. Until the set has 4 members the chain halts whenever testnet-0 is down.

## 5. Upgrades

The testnet tracks the stable `latest` tag. Routine upgrade, from the repo directory:

```
docker compose pull hypersnap && docker compose up -d && sleep 60 && ./join.sh status
```

The `sleep` waits for the node to reopen its database before the status read.
Downtime is one to two minutes. Nightly test windows are announced in advance with
the image tag to use and the time to return to `latest`.

## 6. Troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| Heights stay at 0 on a read node | `docker compose logs hypersnap \| grep -i peer` shows no connections | UDP 3382 is blocked, or `TESTNET_BOOTSTRAP_PEERS` in `.env` is empty. Re-run `./join.sh readnode` after `git pull`. |
| One shard frozen after a restart, the others move | logs filtered for that shard id | Seen on mainnet 2026-11-16. Upgrade to the current image first; then stop, and report the log lines in an issue. |
| "activation schedule differs from gossip" at startup | `validators.testnet.toml` edited by hand | Restore the file with `git checkout validators.testnet.toml`. |
| Node starts as read node although you are a validator | your key is not yet in a set, or `.env` lost `TESTNET_PRIVATE_KEY`, or you changed `.env` or the compose file and only ran `restart` | Wait for the announced height; check `.env`; after any change to `.env` or `docker-compose.yml` run `docker compose up -d` (recreate), `restart` only re-reads `validators.testnet.toml`. |
| Validator misses proposals | clock skew, CPU starvation | `timedatectl` shows NTP synchronized; keep the host for this node only. |

## 7. Leaving

Read node: `docker compose down`. Validator: open an issue asking for removal; a
set change at an announced height removes your key, after which `docker compose down`.
Removing a validator without a set change costs the network one of its tolerated
failures until the next batch.
