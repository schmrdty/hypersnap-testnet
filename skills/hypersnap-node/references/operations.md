# Operating a node for the long term

The install is an afternoon. This is the rest of the year. Everything here applies to
mainnet and testnet alike; testnet simply changes faster.

## A weekly routine, ten minutes

1. Verification block (SKILL.md): heights climbing on every shard, delays in seconds.
2. Version check: is the node's `version` the current release? See "Following releases".
3. Validators file check: does the node's `validators.toml` match the published one?
   See "Validator set changes and fork heights".
4. Disk: `df -h` on the volume holding the RocksDB directory. Mainnet grows by tens of
   gigabytes a week; plan the next disk before the current one is 80 percent full.
5. Peers: `/v1/currentPeers` lists live connections (greater than zero, validators among
   them); `/v1/mesh`, where open, adds `is_validator`. A public health page that derives
   validator membership from the validators file shows the same without any endpoint
   beyond the ordinary API.
6. Logs: `docker compose logs --since 24h hypersnap | grep -ciE 'error|panic'` should be
   small and stable from week to week; a jump is worth reading before anything breaks.

Put steps 1 and 2 in a cron job that pages you (email, a chat bot, anything you read)
when heights are unchanged between two reads ten minutes apart, or when the version
differs from the one you last approved. A node that nobody watches fails silently: the
API keeps answering with frozen heights, and the first sign is a user complaint or a
missed block.

## Following releases

Releases land in three places, and the node only picks them up when you act:

| Where | What it tells you |
|---|---|
| github.com/farcasterorg/hypersnap releases and the commit log | The version number, what changed, whether a release carries a fork height or a config change that needs a new `validators.toml` |
| Docker Hub `farcasterorg/hypersnap` tags | When the numbered tag shares a digest with `latest`, `latest` has moved; a `pull` now gets the new version |
| Announcements from the maintainers (the repository, the Farcaster developer channels, and for the testnet its repository's issues) | Deadlines: a fork height, a set change, a release every validator must run by a given block |

Compare the network, not just the changelog: a public health page that lists other
nodes' versions (see "Public health page") shows within minutes whether the validators
have moved to a new release. A read node one patch behind usually keeps syncing; a
validator one release behind at a fork height stops voting, and the network does not wait.

Upgrade routine for a stock install (the bootstrap script's layout, compose unmodified),
from the `hypersnap` directory:

```
./hypersnap.sh upgrade
```

Upgrade routine for a customized compose (pinned key, edited peers, indexers off), from
the compose directory, after the numbered tag shares a digest with `latest`:

```
docker compose pull hypersnap && docker compose up -d && sleep 60 && docker compose ps
```

The sleep waits for the node to open the database before the status read. Downtime is
one to two minutes. Then the verification block, twice, and the version confirmed through
the node's public address from another machine, not only from localhost. Read the
release notes before the pull: an upgrade that changes the index layout (search, feeds)
rebuilds on first start and can take hours on a 16 GB machine.

A third path keeps the stock script and the customizations both. Upstream's `hypersnap.sh`
runs `docker compose` with no `-f` flag against `docker-compose.yml` in its directory, so a
`docker-compose.override.yml` next to it is merged automatically and is not touched by
`hypersnap.sh upgrade` (checked against the script on 2026-11-18; re-check after a script
update, the file names are near the top). Put the edits there (a pinned key, a different
`HYPERSNAP_CONFIG`, a port mapping) and keep running the stock upgrade. The caveat: the
node's configuration is one `HYPERSNAP_CONFIG` value, so an override replaces it whole;
after every upgrade, diff upstream's new `docker-compose.yml` against the previous one and
carry any change in it (new peers, new sections) into the override by hand.

Rollback is not "pin the old tag". A new version may migrate or rebuild the database, and
an older binary must never open a database a newer one has written. A real rollback needs
a cold copy of the database taken while the node was stopped, before the upgrade, and the
old image pointed at that copy only. On a mainnet node that is a terabyte, which is why
most operators have no rollback and go forward instead: read the release notes first,
upgrade one node at a time, and if the new version is broken, fix forward or resync from
the snapshot. The testnet is small enough to keep a cold copy; do it there.

Bootstrap hygiene: the install one-liner pipes a script from the `main` branch into bash.
Read the script and the compose it fetches before running it, and for a reproducible
install pin a reviewed commit in the URL instead of `refs/heads/main`. A `nightly` channel
exists (`bash -s nightly` on the bootstrap) for testing releases early; validators stay on
stable unless the maintainers announce a window.

Pin what you can prove. `pull_policy: always` with `latest` means an unplanned recreate
(a host reboot with `restart: always` does not pull; `up -d` does) can move the version
without you noticing. If that matters, pin a numbered tag in the compose and move it
yourself.

## Validator set changes and fork heights

The network's history of validator sets, gossip topic cutovers, native registration
heights, and discovery seeds lives in one file, `validators.toml` (on the testnet,
`validators.testnet.toml`). It is bind-mounted and read at start. A change is published as
a new entry with a future `effective_at` height. Every node, validator or not, has to be
running with the new file before that height:

1. Fetch the new file (`git pull` in a checkout, or re-download the published file).
2. Restart so the node reads it: `docker compose restart hypersnap` is enough when only
   this file changed. If `.env` or the compose file also changed since the container was
   created, `docker compose up -d` instead.
3. Verification block, three "Consensus ready" lines, and after the height the validator
   flag (`/v1/mesh` where open; a health page that reads the file otherwise).

A published set can be amended again before its height: on 2026-11-21 a set published the
evening before gained one key back the next morning, same heights. Diff the file daily
until the height has passed, not once when it is announced. Each change is three entries,
one per shard, each with its own `effective_at`; count keys per entry when you diff.

What happens to a node that misses it: a read node stops following at the height,
logging `Received block with wrong number of shard witnesses` or a witness it cannot
verify; a validator that was supposed to join is not counted, and with a small set one
missing signer stops the chain at the height minus one until that node is recreated.
Treat the announced height as a deadline with the same seriousness as a release.

The file carries more than validator sets. Newer copies add activation heights for the
native registration API and for the mempool's fixed rate limit
(`[consensus.native_registration.api_activation_heights]`,
`[mempool.fixed_rate_limit_activation_heights]`). A node on an older copy keeps syncing
as a read node and nobody notices; a validator on it applies different mempool rules than
the others once those heights pass. Diff the whole file, not just the sets.

Also keep the file current between announced changes. `hypersnap.sh upgrade` refreshes it
on a stock install; a hand-managed node has to diff it against the published copy
(`curl -sSL <published url> | diff - validators.toml`).

## Validator-only settings and signals

From the Hypersnap source and the upstream node-types page (re-read 2026-11-21; the page
describes an on-chain registry pull, `ONCHAIN_CONFIG_*`, that does not exist in the
Hypersnap source on `main` as of that date, so the validators file stays the source of
truth and those settings do nothing here):

| Setting | What it does | Who needs it |
|---|---|---|
| `[consensus] private_key` | The identity; the node is a validator only when the peer id derived from it matches a key in the active set (`/v1/mesh` then shows `is_validator: true` and `consensus_public_key`) | validators |
| `l1_rpc_url` | Ethereum mainnet endpoint for ENS and contract-signature checks that validators re-run on gossiped messages | ask the maintainers before joining a set |
| `admin_rpc_auth` | `user:password`, HTTP Basic. Empty: `/v1/mesh` answers anyone and the admin gRPC service is not registered at all. Set: `/v1/mesh` needs the password and the admin service (snapshot upload, event retries, migrations; the debug writers stay off outside devnet) appears on the gRPC port behind it. Read nodes usually leave it open so clients and bots can see whether a node is meshed. The upstream node-types page asks every validator to set it. Monitoring does not depend on the choice: `/v1/currentPeers` stays open and carries the live peer list. Either way keep 3383 off the public internet | read nodes: operator's choice; validators: the upstream page says set it |
| `init: true`, `restart: always`, no health check on the node service | The node-types page's compose requirements for a validator. `restart: always` is what brings a validator back after a host reboot; an `unless-stopped` in a `docker-compose.override.yml` silently wins over the base file's `always`, so check the merged result with `docker compose config`. A health check tuned for a read node restarts a validator on an ordinary dip in commit rate | validators |
| `pruning.event_pruning_schedule` | Daily event pruning, default 00:00 UTC for everyone who never set it. Give each validator its own time, in the override: `SNAPCHAIN_PRUNING__EVENT_PRUNING_SCHEDULE: "0 40 3 * * *"` | validators |
| `gossip.direct_peers` | Explicit gossipsub links between validators, outside the emergent mesh. Default empty, and the mainnet validators run without it; only if the maintainers publish a list | optional |
| `SNAPCHAIN_`-prefixed environment variables (`__` between nested keys) | Override any config key without editing the compose; the clean place is a `docker-compose.override.yml` | anyone customizing a stock install |

Health signals for a validator: `blockDelay` 0 to 1, `Decided value with round: 0` lines with
`signers` that include your key, round numbers that stay at 0 (a persistent 1 or more means
a proposer is missing), `consensus_mesh_size` equal to the number of other validators. A
read node shows `mempoolSize: 4294967295` for the data shards; that is "not reported".

Restart safety on a validator: a block needs more than two thirds of the voting weight, so
with 8 validators 6 must sign. Check who is already down before a restart, restart one
validator at a time and wait for it to sign again, and know that a brief disconnect in the
middle of a round can leave a shard unable to reach quorum for several rounds. A validator
on a residential link pays this cost on every blip.

Background jobs: event pruning runs daily at 00:00 UTC on shards 1 and 2 (retention 3 days
by default) and is disk-heavy; give each validator its own `pruning.event_pruning_schedule`
so they do not prune together. Block pruning is read nodes only and off by default.

## A node behind a tunnel or NAT

Some operators run the node at home behind a WireGuard tunnel to a VPS that forwards 3381
and 3382. It works, and it is where two days of trouble came from (2026-11-20 and 21):

1. The observed port differs from the announced one. Outbound connections leave the VPS
   from whatever source port the masquerade picks, so peers record the node at `:3382`
   (announced) and at another port (observed). That is normal and peers cope with it. Do
   not try to fix it with an SNAT rule that pins the source port to 3382: peers' replies
   then land on dead mappings, every sync request times out, all shards stall, and the
   stall outlives the rule until the node has been stopped long enough for the mappings
   to expire.
2. A WireGuard container inside Docker Desktop on macOS degrades under sustained UDP load:
   45 to 73 percent packet loss inside the tunnel while the Mac's own path to the VPS is
   clean. Measure both before blaming the node or the peers: from inside the tunnel
   container `ping -c 30 -i 0.2 <tunnel gateway address>`, and from the host `ping`
   to the VPS address. Loss inside and none outside means restart the tunnel container,
   with the node stopped first so it does not thrash, then start the node. It recurred
   within seven hours once; a validator wants its own public address on a Linux host.
3. If the VPS masquerades inbound traffic into the tunnel, every inbound peer appears to
   the node as the tunnel gateway address. Harmless, but the node's log can never show
   who dialed it.
4. After a flood of reconnects (a stall, a broken rule, a lossy tunnel), validators may
   accept the node's connection and close it 50 ms later, hundreds of times an hour, for
   tens of minutes after the cause is gone. It clears on its own, each peer on its own
   clock. Repeated restarts restart the flood; measure the tunnel, fix the cause, wait.
5. When another operator says they see your node at `127.0.0.1`: your announce address is
   what the network records (check it in any open node's `/v1/currentPeers` contacts), so
   the loopback is on their side, usually an inbound forwarder rewriting sources. Give
   them your full multiaddr with `/p2p/<peer id>` so their node dials you outbound.

## Operator toolkit and host hardening

Hypersnap Doctor (https://github.com/arcabotai/hypersnapdoctor, by Arca, independent of
upstream) installs a `hypersnap` command: `hypersnap doctor` checks Docker, Compose,
containers, ports, disk, memory, logs, and the info endpoint; `hypersnap share` writes a
sanitized report for a support thread; `--fix` does only low-risk repairs and never deletes
state or restarts containers. Its install line (`curl -fsSL https://hypersnap.org/install.sh | bash`)
pipes a script into bash too; read it first. Its validator-history repair guide is the
reference for a node stuck on block signatures (troubleshooting.md).

Host hardening the run-a-node page asks for: key-based SSH with a tested second login
before any change, unattended security updates, SSH reachable only over Tailscale or
WireGuard where possible, fail2ban on anything public, and a cloud firewall that allows
only 3382/udp plus restricted SSH. Review IPv4, IPv6, cloud rules, and Docker mappings
together; Docker's own rules sit ahead of ufw.

## Backups and identity

1. The private key, once, offline, encrypted, with a tested restore. Without it a
   validator cannot be moved to a new host or rebuilt after a disk failure.
2. The compose file and `.env` (minus nothing; they hold the key, so treat the backup like
   the key).
3. The database is replaceable: mainnet from the snapshot (about 870 GB download, one to
   two hours on a good link, then catch-up), testnet from block 1 in minutes. Do not spend
   backup effort on it unless the uplink is too slow to redownload.

Moving a node to a new host: copy the key, compose, `.env` and validators file; start the
new host with the old one stopped (two nodes with one key fight over one identity); the
peer id is unchanged, so seed lists and listings keep working; on mainnet let the new host
load the snapshot rather than copying a terabyte over a residential uplink.

## Capacity

| | Mainnet read node | Testnet read node | Testnet validator |
|---|---|---|---|
| RAM | 16 GB, more with the indexers on | 4 GB | 8 GB |
| CPU | 4 cores | 2 | 4 |
| Disk | 1.5 TB free and growing; the database passed 1 TB in late 2026 | 50 GB | 100 GB |
| Network | public IPv4, wired uplink; a slow residential upload makes the node a bad peer | UDP 3382 reachable | static IPv4, always on |

The `[api]` indexers (social graph, channels, search, feeds, conversations) replay the
chain on first enable and cost memory every day after. A node that only needs the hub API
runs them off.

## Reboot survival

`restart: always` in the compose and Docker enabled at boot; a full host reboot brings a
node back in about a minute and a half without any hand work. Test it once on purpose,
during a quiet hour, and run the verification block after. On a validator, announce it.

## Public health page

A dashboard that polls many nodes' `/v1/info` and compares them is the cheapest
monitoring there is, because it shows your node next to the network: same version,
same heights, same shards. Getting listed takes a public HTTP address for the node's API
that answers `/v1/info` and `/v1/castsByFid?fid=2` with JSON (plain `http://host:3381` or
https through a proxy; a hosted function that implements only `/v1/info` is not enough),
whether the node is a validator, and a display name. Check both calls from a machine that
is not the node host before asking.

## When the network resets or forks

Testnets get regenesised with notice: the maintainers publish a new validators file and a
date; every node stops, removes its RocksDB directory, and starts again on the new file.
Mainnet forks (a change of gossip topics, a new engine version) are carried by the same
file plus a release, with a height; a node that is current on both passes the height
without doing anything on the day.
