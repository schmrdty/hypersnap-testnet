# Mainnet read node

## Requirements

Upstream's README asks for 16 GB RAM, 4 cores, 1.5 TB of free storage, a public IP, and
ports 3381 to 3383 reachable (3382 UDP is the one sync depends on; 3383 can stay closed to
the public). In practice the RocksDB passed 1 TB in late 2026 and grows weekly; the first
snapshot download is about 870 GB and takes one to two hours on a good link. The uplink
is the usual bottleneck: a slow residential upload makes the node a bad peer and turns any
copy or backup into days. A wired link to the primary router, or a server, is the floor.
A home node reaching the network through a WireGuard tunnel inside Docker Desktop on
macOS adds a failure mode of its own (operations.md, "A node behind a tunnel or NAT"); a
validator belongs on a Linux host with its own public address.

## Install

Upstream's path, as a user with Docker access:

```
curl -sSL https://raw.githubusercontent.com/farcasterorg/hypersnap/refs/heads/main/scripts/hypersnap-bootstrap.sh | bash
```

It creates `~/hypersnap` with `hypersnap.sh`, pulls `docker-compose.mainnet.yml` and
`validators.toml`, and starts the node, which downloads the snapshot before it syncs. The
image is `farcasterorg/hypersnap:latest` with `pull_policy: always`. Day-to-day commands
go through `hypersnap.sh` (start, stop, logs, status, upgrade). A node managed this way is
a "stock install" and upgrades with `./hypersnap.sh upgrade`, which also refreshes
`validators.toml`.

## Decide three things before the first start

1. **Stock or customized.** The moment the compose file is edited (pinned key, peer
   list, indexers off), `./hypersnap.sh upgrade` becomes dangerous because it restores
   upstream's compose. A customized node upgrades by hand (`references/operations.md`).
   Decide which kind this node is and write it in the compose directory as a note.
2. **The `[api]` indexers.** Upstream enables social graph, channels, metrics, search,
   feeds, and conversations. They replay the chain on first enable (hours on a 16 GB
   machine) and the metrics worker can rebuild on every restart. A node that only needs
   the hub API (`/v1/info`, `/v1/castsByFid`, ...) runs with `[api] enabled = false`;
   turn the indexers on only with memory to spare.
3. **A pinned identity.** Set `[consensus] private_key` to a key you generated
   (`openssl genpkey -algorithm ed25519`, the 32-byte seed in hex) so the peer id survives
   recreates. A read node without a key gets a random identity on every recreate, which is
   fine until a seed list, a monitoring entry, or a peer's allowlist refers to it.

## Bootstrap peers and discovery

The mainnet compose lists Farcaster's Snapchain nodes in `[gossip] bootstrap_peers`.
Those relay Snapchain topics, not Hypersnap's, so a fresh node can sit at a fork height
logging `InsufficientPeers (hypersnap/read-node-peers)`. The shipped `validators.toml`
enables `[gossip.discovery]` with Hypersnap seeds, which normally covers it. If the node
does not move, replace `bootstrap_peers` with Hypersnap validators taken from a working
node's `/v1/mesh` (`peers[].contact_info.gossip_address`), written as
`/ip4/<ip>/udp/3382/quic-v1`. Keep every entry `/ip4/`: the swarm has no DNS transport, so
a `/dns4/` entry is never dialed.

## After the first start

The verification block from SKILL.md, twice. Expect the snapshot phase first (heights
jump to the snapshot's height, then climb), peers greater than zero in `/v1/mesh`, and the
version equal to the current release. Then set up the weekly routine and the frozen-height
alert from `references/operations.md`; a mainnet node that is not watched will be found
frozen by someone else.

## Upgrades

Stock install, from `~/hypersnap`: `./hypersnap.sh upgrade`. Customized compose, from the
compose directory, once the numbered tag on Docker Hub shares a digest with `latest`:

```
docker compose pull hypersnap && docker compose up -d && sleep 60 && docker compose ps
```

Then the verification block, and the version confirmed from another machine through the
node's public address. Diff `validators.toml` against upstream's before every announced
fork or set change; `hypersnap.sh` does it for a stock install, a hand-managed node does
not.

## Remote hosts

On macOS with Docker Desktop, docker is not on the PATH over ssh: prefix commands with
`export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`. A Docker Desktop
resource change restarts the container. macOS ships BSD tools (no `timeout`, no `grep -P`,
`rsync` is openrsync). Treat the Docker VM's memory limit, not the host's, as the node's
RAM.

## Seeding another operator from your database

Copying a database saves the other operator the snapshot download, and it works, but
RocksDB compaction renames files constantly: do a bulk pass while running, a second pass,
then a final pass with the node stopped and `--delete`. Judge progress by files
transferred per pass, not bytes (compaction can shrink the set by a tenth during the copy).
Verify per-shard file counts and byte sums on both sides before the copy is started, and
run the copy on the same or a newer version than the one that wrote it. Over a residential
uplink the snapshot is faster.
