# Troubleshooting, by symptom

Read the state first (the verification block in SKILL.md), then match the row. Every fix
here has been used on a real node.

| Symptom | Cause found | Fix |
|---|---|---|
| Heights frozen on all shards, logs full of `InsufficientPeers (hypersnap/read-node-peers)` | No Hypersnap peers: `bootstrap_peers` lists Snapchain-only nodes, or UDP 3382 is blocked (cloud firewall, router, missing `/udp` mapping; ufw rarely, Docker bypasses it) | Replace `bootstrap_peers` with Hypersnap validators from a working node's `/v1/mesh`, `/ip4/` entries only, open 3382/udp at every layer, `docker compose up -d`; blocks resume within a couple of minutes |
| Heights frozen, peers connect and drop, logs mention version or protocol near the disconnects | The image is behind the network after a release | `docker compose pull hypersnap && docker compose up -d`, then confirm the version matches other nodes |
| One shard frozen after a restart while the others advance (common on a node running a copied database) | Old image | Same pull and recreate; the shard moves on the current version |
| Set change height passed, chain stuck at the height minus one, logs `Received block with wrong number of shard witnesses`, or a lone validator never gets a second signature | A member of the new set was not actually a validator at the height: `restart`ed instead of recreated and never received its key, or down | `docker compose up -d` on that node; the chain resumes when enough signers are present. Before every height, every node recreates or restarts with the new file |
| Block shard (shard 0) stuck for good after a second validator joins, data shards fine, logs `Unable to find last shard witness for block` | Fresh chain started with one validator: every block has an empty witness list (upstream issue 88) | No repair; regenesis with two or more validators in the genesis set |
| `docker compose logs` shows the node starting as a read node although a key is configured | The container predates the change (compose or `.env` edited, then `restart`) | `docker compose up -d`. To prove the running container has a key without printing it: `docker compose exec hypersnap grep -c 'private_key = "[0-9a-f]\{64\}"' config.toml` (1 means present, 0 means the container was created without it). Never dump the container's environment with `docker inspect`; on composes that substitute the key into `HYPERSNAP_CONFIG`, that prints the key |
| `/v1/info` answers but `castsByFid` and every other path return 404 with a hosting provider's page | A hosted function or static site in front implements only the info call | Expose 3381 through a real reverse proxy on the node host, or proxy every `/v1/*` path |
| A health page shows the node down while `curl` from a server answers in under a second | The page's timeout (often 10 s) against a node busy with indexers answering in 1 to 20 s; container memory near its limit | Raise container memory or turn the `[api]` indexers off; measure response time from a remote host before blaming the network |
| The node's DNS name resolves to a web host, 3381 filtered, 443 does not complete TLS | The name points at a website, not the node | Open 3381 on the node host and point the name there, or add a TLS proxy and share that name |
| A copied database runs a day behind and never catches up on one shard | The database came from a newer or older binary than the one running it | Run the same or a newer version than the one that wrote it |
| `hypersnap.sh upgrade` replaced a customized compose file | By design: the script installs upstream's file | Keep a dated backup of the compose before any upstream script; restore the stanzas you need (`[api]`, peers, pinned key); decide stock or customized once and write it down |
| In the published validator set, caught up, but never signs; `/v1/mesh` shows `is_validator: false` and `consensus_public_key: null` | The running identity is not the key in the set: the container was created without the key (`restart` after the edit, or a read-node compose), or the node was recreated keyless and got a random identity, or a different key was handed in | Derive the running key from the peer id (base58-decode, drop the 6-byte prefix) and compare with the set; `docker compose exec hypersnap grep -c 'private_key = "[0-9a-f]\{64\}"' config.toml`; `docker compose up -d`; if the key still differs, the maintainers have the wrong key |
| Logs `Block contained signatures from unexpected signers` or `Dropping decided block because its signatures are invalid`, node stuck after a validator rotation | The node's `validators.toml` lacks the entries for the new set, so it rejects correctly signed blocks | Do not delete the database, reload a snapshot, or disable verification. Compare the local file with the published history, add the missing entries, keep the database and identity, restart, then verify the two error lines stop (Hypersnap Doctor's validator-history repair guide walks this with backups) |
| Container exits with code 1 right after a manual `docker run` | Started without the generated `config.toml` or the volume mounts | Use the compose flow; read the logs of the newest failed container, do not keep creating new ones |
| `/v1/info` refuses connections during the first sync | Normal during snapshot bootstrap; the endpoint opens once enough state exists | Watch the logs for snapshot chunk progress before declaring the node dead |
| Disk at 100 percent during snapshot import | Snapshot staging plus the database on one volume | `df -h` and `du -xhd1` first; grow the volume rather than deleting artifacts unless a staging directory is provably stale |
| Blocks rejected, delays growing, peers fine | Clock drift | `timedatectl` must show NTP active; drift breaks block validation |
| Container OOM-killed, sync crawls | Less than 16 GB of real RAM, swap doing the work | `dmesg \| grep -i kill`, `free -h`; resize the host rather than tuning container limits |
| Peer id changed after a recreate | A read node without `[consensus] private_key` gets a fresh random key each time | Pin the key; update any seed list or listing that carried the old id |
| Validator misses proposals, consensus rounds climb | Clock skew or CPU starvation | `timedatectl` shows NTP synchronized; dedicate the host to the node |
| Node fine for weeks, then stuck at a specific height with everyone else moving | A fork height or set change passed with an old `validators.toml` | Fetch the published file, `docker compose restart hypersnap` (or `up -d` if more changed), verify; add the weekly file diff from operations.md |
| After a start, delays climb on all shards; shards 1 and 2 log `fork block event ... from block N is not committed on shard zero yet` nonstop; shard 0 shows `round=-1` and `Buffer is full, dropping message`; no `Consensus ready` line for `[0]` | The block shard's consensus never started on this boot (seen on 0.17.17, 2026-11-20); the data shards correctly wait for it | `docker compose restart hypersnap`, then confirm three `Consensus ready` lines. The same error lines during the first minutes after a start, with all three ready lines present, are normal catch-up |
| Delays climb, dozens of `Connection established` and `Connection closed` per minute, `No peer to request sync from`, sync requests time out; `/v1/info` still answers | The path, not the node: packet loss inside a tunnel, or a NAT rule that pins the outbound port | Measure loss from inside the tunnel container and from the host (operations.md, "A node behind a tunnel or NAT"); stop the node, fix or restart the tunnel, start the node. Never pin the outbound UDP port |
| In sync, but every validator closes the node's connection 50 ms after the handshake (`ApplicationClosed error_code 0`), hundreds of times an hour; read nodes hold it; tunnel loss 0 percent | Peer-side after-effect of a reconnect flood | Wait; it clears peer by peer within tens of minutes. Check the tunnel is clean, then leave it alone; restarts prolong it |
| Another operator reports your node at `127.0.0.1` | Their inbound forwarder rewrites sources; the network records your announce address | Confirm in any open node's `/v1/currentPeers` contacts, then give them the full multiaddr with `/p2p/<peer id>` for an outbound dial |
| Disk full, node restarts in a loop | RocksDB grew past the volume | Stop the node, grow or move the volume (the directory named by `rocksdb_dir`), start; plan the next disk at 80 percent |

## Reading the logs for consensus

`docker compose logs --since 10m hypersnap | grep "Block}"` shows block-shard consensus;
`grep "Shard 1}"` and `"Shard 2}"` the data shards. Healthy lines: `Starting new height`,
`Proposing value`, `Decided round=0`. Trouble: `round=NN` with NN climbing, `Timeout
elapsed`, repeated `ERROR` from `consensus::proposer`. No block-shard lines at all means
the block shard is not running consensus, not that it is quiet.

## Reading /v1/currentPeers

Always open. `peers[]` is every live connection: `peer_id`, `source` (`collected` when
the peer's contact info arrived over gossip, `derived` when only the connection is known),
`observed_address`, and for collected peers `contact_info` with the announced
`gossip_address`. No validator flag: derive the consensus key from the peer id
(base58-decode, drop the six-byte `002408011220` prefix, the 32 bytes left are the key)
and look it up in the validators file. A node's own peer id is `peer_id` in `/v1/info`.

## Reading /v1/mesh

`self.is_validator` is the node's own view of its role and flips at the set's
`effective_at` height, not when the key is configured; `self.consensus_mesh_size` counts
peers on the consensus topic; `peers[]` lists known contacts with `connected`. A validator
that shows `peers: []` while its partner lists it is normal asymmetry, not a fault.
