---
name: hypersnap-node
description: Run a Hypersnap node (the Farcaster Hypersnap network) for the long term, as a mainnet read node, a testnet read node, or a testnet validator. Covers the whole lifecycle, not just the first start. Install and verify, keep the node in sync, watch for and apply releases, carry validator set changes and fork heights, back up the identity key, recover from stalls and bad upgrades, and get the node listed on a public health page. Use this whenever someone wants to run, join, install, operate, upgrade, maintain, monitor, migrate, or debug a Hypersnap or Snapchain-style node, asks about hypersnap.sh, docker-compose.mainnet.yml, validators.toml, bootstrap_peers, shard stalls, "InsufficientPeers", snapshot downloads, the Hypersnap testnet, validator set changes, or whether their node is on the current version, even if they only say "my node is stuck", "is my node up to date", or "how do I run a hypersnap node".
---

# Running a Hypersnap node

Hypersnap is the Farcaster network's Hypersnap fork (github.com/farcasterorg/hypersnap).
Three shards: 0 is the block shard, 1 and 2 hold data. Blocks every second. A validator
set that changes at announced heights, and read nodes that follow it. One binary and one
Docker image run mainnet and testnet; the configuration decides which.

A node is not a thing you start, it is a thing you keep. The network ships releases
often, changes its validator set and fork heights by publishing a file every node must
carry, and never waits for a node that fell behind. Most node failures in practice are
not install failures; they are a node that was fine for weeks and then missed a release,
a file update, or a container recreate. This skill treats day two as the main job.

## Pick the node, then read one reference

| The operator wants | Node | Read |
|---|---|---|
| Serve the real network's data, run a client against production, compare with others | Mainnet read node | `references/mainnet.md` |
| A disposable chain to test a client, an upgrade, an API | Testnet read node | `references/testnet.md` |
| Help secure the testnet, rehearse validator operations | Testnet validator | `references/testnet.md` |
| Keep an existing node healthy, current, and in the set | any | `references/operations.md` |
| Something is wrong right now | any | `references/troubleshooting.md` |

Mainnet validators are admitted by the project, not by this skill: a mainnet validator
key enters the published `validators.toml` through the maintainers. Help with the
read-node setup and the operating routine, and point the operator at the upstream
repository for the validator conversation.

## Rules that hold for every node

1. **Measure before you state.** Ports, paths, versions, heights, and peer counts come
   from the machine (`curl -s localhost:3381/v1/info`, `docker compose ps`, the compose
   file), not from memory or from this skill. The software moves fast enough that a number
   remembered from last week can be wrong; the image tag `latest` has moved several patch
   versions in a single day.
2. **The private key is the node's identity.** `[consensus] private_key` is a 32-byte
   ed25519 secret in hex. The libp2p peer id derives from it, so losing or changing the key
   changes who the node is on the network. It is never printed, pasted, or committed. Only
   the 64-hex public key is shared. A validator without a backup of its key is one disk
   failure away from having to be removed from the set and re-added.
3. **`restart` is not `up -d`.** `docker compose restart` restarts the existing container
   with the environment it was created with. It re-reads bind-mounted files such as the
   validators file, and nothing else. After any change to `docker-compose.yml` or `.env`,
   or after a `pull`, run `docker compose up -d` so the container is recreated. The
   classic failure: a key added to `.env`, a `restart`, and a node that is still a read
   node when the set change height arrives.
4. **State the implications before a stop or restart.** A read node stops serving. A
   validator's absence spends one of the network's tolerated failures: with N validators,
   floor((N-1)/3) may be down at once; with 1 or 2 validators, one down halts the chain.
   To stop a node on purpose use `docker compose stop`, which does not auto-restart.
5. **UDP 3382 (gossip) must be reachable from the internet; nothing else has to be.** TCP
   3381 is the HTTP API and TCP 3383 is gRPC; the project's run-a-node page keeps both on
   localhost by default (`127.0.0.1:3381:3381/tcp`, `127.0.0.1:3383:3383/tcp`) and publishes
   3381 only as a deliberate choice, behind a proxy with rate limits, when the node serves
   clients or a health page. 3383 stays private always: with `admin_rpc_auth` set it also
   carries the admin service. `/v1/mesh` on 3381 is a diagnostic view behind `admin_rpc_auth`;
   read nodes usually leave it open so clients and bots can see whether a node is meshed, and
   the upstream node-types page asks validators to set `admin_rpc_auth`. Either way the peer
   list is always available on `/v1/currentPeers`, the ordinary API route, so nothing that
   monitors a node needs the mesh view. A node with 3382 blocked logs `InsufficientPeers`
   forever. On a Docker host, ufw is rarely the blocker: Docker publishes ports through its
   own iptables chain ahead of ufw's input rules. Check the layers ufw cannot see first: a
   cloud firewall, a home router, or a missing `/udp` in the compose port mapping.
6. **Two reads a minute apart.** "Running" means every shard's `maxHeight` is higher on
   the second read and `blockDelay` is seconds, not thousands of seconds. One read proves
   nothing; a node can answer `/v1/info` with frozen heights for hours.
7. **Every start must print three "Consensus ready" lines**, one per shard, in
   `docker compose logs`. A shard that never prints it sits at `round=-1` with "Buffer is
   full" warnings, and the other shards soon log `fork block event ... is not committed on
   shard zero yet` because they wait for the block shard. Seen on 0.17.17 on a node that
   restarted onto the new image (2026-11-20); one more restart fixed it. The same "not
   committed on shard zero yet" errors are normal for a few minutes of catch-up after any
   start; they are a problem only when shard 0's ready line is missing.
8. **`./hypersnap.sh upgrade` replaces the compose file with upstream's.** That is right
   for a stock install and wrong for a node with a customized compose (pinned key, edited
   peers, indexers off). Know which kind of node this is before upgrading.

## Sources this skill was checked against

The upstream repository (`farcasterorg/hypersnap`: README, `docker-compose.mainnet.yml`,
`validators.toml`, `scripts/hypersnap.sh`, `site/docs/pages/node-types.mdx`, and
`site/docs/pages/guides/` with `running-a-node.mdx` and `managing-a-node.mdx`, re-read
2026-11-21 together with the 0.17.17 commits), the
project's operator page (https://hypersnap.org/run-a-node), the independent Hypersnap
Doctor toolkit (https://github.com/arcabotai/hypersnapdoctor, with its validator-history
repair guide), and the node source for every claim about configuration keys, all read on
2026-11-19 and 2026-11-21. The operating rows marked 2026-11-20 and 2026-11-21 come from a
mainnet read node's first two days of joining the validator set, through a 0.17.16 and a
0.17.17 upgrade, two validators-file changes, and a network halt. The developer docs at https://hypersnap.org/docs (and `llms-full.txt` there)
cover the read API, webhooks, and mini apps for client builders, not node operation; point
an agent building against the API at them instead of at this skill.

## The verification block

Use it after every start, upgrade, file update, or config change, and in any monitoring:

```
curl -s localhost:3381/v1/info | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["version"], [(s["shardId"], s["maxHeight"], s["blockDelay"]) for s in sorted(d["shardInfos"], key=lambda s: s["shardId"])])'
```

Run it twice, 60 seconds apart. Expected: the version you intended, all shards present,
heights higher on the second read, delays under about 10 seconds. That is the chain gate.
A node that serves clients has more gates (the run-a-node page lists them): archive replay
complete on every shard, reconciliation of rejected events, each index built, and the
native API answering with real profiles and feeds. An info response alone proves none of
those. Then:

```
curl -s localhost:3381/v1/mesh | python3 -c 'import sys,json; m=json.load(sys.stdin); print(m["self"]["peer_id"], m["self"]["is_validator"], len(m["peers"]), "peers")'
```

gives the identity, the role as the node sees it, and whether it has peers, when the node
leaves the mesh view open. When it does not (HTTP 401), the open routes carry the same
facts: `/v1/info` has `peer_id`, and `/v1/currentPeers` lists live connections:

```
curl -s localhost:3381/v1/currentPeers | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d["peers"]), "peers,", sum(1 for p in d["peers"] if p["source"]=="collected"), "with contact info")'
```

After every start, also:

```
docker compose logs --since 5m --no-log-prefix hypersnap | grep -a "Consensus ready" | cut -c1-110
```

Three lines, `[0]`, `[1]` and `[2]`. Fewer means a shard did not start; restart once.

## How to answer

Lead with the node's state in one line (in sync or not, with the measured numbers), then
the steps in order, one command per step, each from a named directory. Keep a first
answer to what fits on two screens: the operator can ask for the next layer, and the
references are there to be pointed at, not pasted. Give the lesson
behind a rule, not the history of who learned it. A first-time operator wants the
shortest path to a running node, then the checks, then the operating routine; keep the
routine (`references/operations.md`) as the part they come back to, and say so.
