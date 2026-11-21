# Testnet node (read node or validator)

The community testnet is defined by one public repository: configuration, validators
file, join script, runbook, and the RFC. It is the source of truth; this file is the
field guide.

Repository: https://github.com/schmrdty/hypersnap-testnet. Registration and announcements
(set changes, releases, resets) are its issues. Public API of the genesis node:
https://hst0.schmidtiest.xyz. Health page: https://snapdiff.schmidtiest.xyz/?net=testnet.

## What the testnet is

`fc_network = Testnet`, three shards like mainnet, 1 s blocks, image
`farcasterorg/hypersnap:latest`. Accounts are native: a custody proof of work
(`./native_register --network 2` inside the container), no contract, no fnames; FIDs start
at 4294967296. No snapshots: a node syncs from block 1, in minutes while the chain is
young. The chain may be reset with notice; nothing on it has value.

## Join

1. Minimums. Read node: 2 vCPU, 4 GB RAM, 50 GB SSD, UDP 3382 reachable. Validator:
   4 vCPU, 8 GB, 100 GB SSD, static IPv4, UDP 3382 open, always on, NTP synchronized.
   Docker Engine with the compose plugin installed first. TCP 3381 is optional: open it
   only to be listed on the health page or to serve clients; 3383 stays on localhost.
2. Firewall: `sudo ufw allow 3382/udp` (and `3381/tcp` if the API is to be public), plus
   the cloud firewall or router if there is one.
3. `git clone https://github.com/schmrdty/hypersnap-testnet && cd hypersnap-testnet`.
4. `./join.sh readnode` or `./join.sh validator`. The script asks for the public IPv4,
   writes `.env` (mode 600) and `docker-compose.yml`, generates the consensus key for a
   validator with openssl, pulls the image, and starts the node. The key is generated
   before the first start on purpose: the peer id derives from it, so a peer id reported
   from a keyless run would be wrong once the key is added.
5. Two minutes later, `./join.sh status`: heights climbing on shards 0, 1, 2, the peer id,
   and the validator flag (false until the key is in a published set).
6. Register with the repository's operator issue template: public IP or name, peer id,
   and for validators the PUBLIC key the script printed. Never the private key, `.env`, or
   a `.pem`.

A validator candidate runs as a read node until a published set change includes its key.
That can take days; it is the normal state, not a fault.

## Keeping up: the part that matters

Everything in `references/operations.md` applies. The testnet specifics:

1. **Watch the repository.** Set changes, release windows, and resets are announced as
   issues with a height or a date. Subscribe to the repository's notifications; a
   validator that misses a set change height stops the chain for everyone.
2. **Set changes.** A change is a new `[[consensus.validator_sets]]` entry in
   `validators.testnet.toml` with a future `effective_at` listing the whole new set, plus a
   discovery seed line for a new node. Before the height, from the checkout:

   ```
   git pull && docker compose restart hypersnap && ./join.sh status
   ```

   `restart` is enough when only the validators file changed. A node whose `.env` or
   compose also changed (a read node that just got its key) needs `docker compose up -d`,
   or it keeps running as a read node and the set is one signer short at the height.
3. **Releases.** The testnet runs `latest`. When the maintainers announce a release
   window, `docker compose pull hypersnap && docker compose up -d`, then `./join.sh status`
   twice. Compare the version with the other testnet nodes on the health page.
4. **Resets.** A regenesis is announced with a date and a new validators file. On the day:
   `docker compose stop`, remove the RocksDB directory named in the compose
   (`.rocks.testnet`), `git pull`, `docker compose up -d`. The key and peer id survive; the
   chain starts from block 1.
5. **Leaving.** Tell the maintainers first so the set can be changed before the node
   goes; a validator that disappears without a removal entry costs the network one of its
   tolerated failures until the next set change.

## Why the testnet starts with two validators

A lone validator on a fresh chain commits block 1 with zero shard witnesses (the data
shards have no chunk 1 yet when block 1 is proposed, and every later block inherits the
empty list). Nothing notices until a second validator validates a block-shard proposal,
rejects it, and the block shard halts for good. Reported upstream as
farcasterorg/hypersnap issue 88. So a fresh chain always starts with at least two keys
in the genesis set, and a new chain is checked early: `HubService/GetBlocks` over gRPC in
the container (`grpcurl -plaintext -import-path /app/proto -proto rpc.proto -d
'{"start_block_number":2,"stop_block_number":3}' localhost:3383 HubService/GetBlocks`)
must show two `shardChunkWitnesses`; an empty `shardWitness` means the chain is already
poisoned and needs a regenesis.

## Posting from an account (the end-to-end client test)

`tools/first-cast` in the repository: with the custody key in
`HYPERSNAP_CUSTODY_PRIVATE_KEY`, it registers an ed25519 signer through a gasless
`KEY_ADD`, posts one cast signed by it, and reads the cast back from `castsByFid`. Node 20
or newer, or the `node:22` image when the host has no Node. The signer's private key goes
to a mode-600 file next to the script, never to the screen.

## Fronting the API with TLS (optional)

Caddy with a site block `reverse_proxy 127.0.0.1:3381`, the DNS record set to DNS only
(no proxying) so Caddy can obtain certificates, then the compose mapping changed from
`"3381:3381/tcp"` to `"127.0.0.1:3381:3381/tcp"` and `docker compose up -d`. Gossip on UDP
3382 never goes through the proxy.
