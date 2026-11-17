# Rehearsal: genesis on an hourly VPS (November 2026)

Purpose: prove the whole operator path on a disposable machine before the genesis
validator moves to its permanent host. Every step records its output below the
command. Status: WRITTEN; each section becomes TESTED when its output is pasted in.

Machine actually used: dedicated server, Ubuntu 26.04.1, 4 cores / 8 threads, 32 GB
RAM, 2 x 250 GB SSD in RAID1 as root, static IPv4 93.115.27.5, kept as the permanent
testnet-0 host (plan change 2026-11-16). Everything runs as root in `~/desoct`
(the operator shortened the directory name; the repo files are unchanged).

## A. Host preparation

1. Packages and firewall:

```
apt-get update && apt-get install -y docker.io docker-compose-v2 git ufw && systemctl enable --now docker && ufw allow 22/tcp && ufw allow 3381/tcp && ufw allow 3382/udp && ufw --force enable && ufw status && docker compose version
```

2. Copy this repository to the VPS. From the desktop:

```
rsync -a --exclude .git ~/Desktop/D3MYUR/D3MYUR/hypersnap-testnet/ root@VPS_IP:hypersnap-testnet/
```

Output:

```
(paste)
```

## B. Genesis key and network file

The genesis validator cannot use `join.sh validator` because that script refuses a
network file with placeholders. These steps do by hand what the script does.

1. Generate the key (prints the PUBLIC key only; the private key goes straight into `.env`):

```
umask 077 && openssl genpkey -algorithm ed25519 -out testnet-validator.pem && printf 'PUBLIC_IP=%s\nTESTNET_BOOTSTRAP_PEERS=\nTESTNET_PRIVATE_KEY=%s\n' "$(curl -4s https://api.ipify.org)" "$(openssl pkey -in testnet-validator.pem -text -noout | awk '/priv:/{f=1;next}/pub:/{f=0} f{p=p $0} END{gsub(/[: ]/,"",p);print p}')" > .env && openssl pkey -in testnet-validator.pem -text -noout | awk '/pub:/{f=1;next} f{p=p $0} END{gsub(/[: ]/,"",p);print "PUBLIC:",p}' && wc -c .env
```

Expected: one `PUBLIC:` line with 64 hex characters, and `.env` of about 130 bytes.

2. Put the public key and the IP into the network file (replace `PUBKEY` with the value printed above):

```
sed -i "s/GENESIS_VALIDATOR_PUBLIC_KEY/PUBKEY/; s/GENESIS_VALIDATOR_IP/$(grep PUBLIC_IP .env | cut -d= -f2)/" validators.testnet.toml && grep -n "PUBKEY\|GENESIS" validators.testnet.toml
```

Expected: only the `GENESIS_VALIDATOR_PEER_ID` placeholder remains (filled in step C.3).

2b. Remove the seed line that still carries the peer id placeholder; it is not a
valid multiaddr and the node must not read it on the first start:

```
sed -i '/GENESIS_VALIDATOR_PEER_ID/d' validators.testnet.toml && grep -n -A3 'bootstrap_peers = \[' validators.testnet.toml
```

Result 2026-11-17: PUBLIC 0796d669192621a54f6ae2625e3bdd60608261b4ebdf84dfbcf2b6457ab73636, `.env` 132 bytes, array left with the comment only. TESTED.

3. Start:

```
cp docker-compose.validator.yml docker-compose.yml && docker compose pull hypersnap && docker compose up -d && sleep 30 && docker compose logs hypersnap | tail -n 60
```

The sleep waits for the node to create `.rocks.testnet` and print its startup lines.

Result 2026-11-17 13:16 UTC: 60 lines of consensus at height 28 on shards 0, 1, 2,
each round decided in round 0 by 0796d669 alone, `Received block shard=1/2 height=28`,
plus `InsufficientPeers` warnings on every gossip publish (expected with no peers).
A single validator reaches quorum. TESTED.

## C. Genesis verification

1. Heights, twice, one minute apart:

```
./join.sh status; sleep 60; ./join.sh status
```

Expected: shards 0, 1, 2 present, `maxHeight` higher on the second read. Record the
block time: (second height minus first height) over 60 s.

2. Proposer evidence:

```
docker compose logs hypersnap | grep -i -m5 "propos\|decided\|commit"
```

3. Peer id: find the startup line that prints it, put it into the network file, and
record the exact log phrase so `join.sh status` can grep for it:

```
docker compose logs hypersnap | grep -i -m3 "peer"
```

```
sed -i "s/GENESIS_VALIDATOR_PEER_ID/12D3Koo.../" validators.testnet.toml && docker compose restart hypersnap && sleep 20 && ./join.sh status
```

Result 2026-11-17, read from the snapdiff VPS over the public port:

```
15:17:20 0.17.15 [(0, 78, 0), (1, 78, 0), (2, 78, 0)] msgs 0
15:18:21 0.17.15 [(0, 138, 1), (1, 138, 1), (2, 138, 1)] msgs 0
```

Block time 1.0 s (60 blocks in 61 s), all three shards in step. Peer id read from
`/v1/mesh` field `self.peer_id` (no log grep needed; `join.sh status` now does this):
`12D3KooWAKzRZCQkaeZuC7vMATpfbJN27xEXMFhYZsW8h7eMBKKj`, `network TESTNET`,
`is_validator true`. The seed line was filled in the repo copy of
`validators.testnet.toml` and re-synced to the server. TESTED.

If a single validator never commits a block: generate a second key with the same
commands into a second project directory (ports 4381, 4382), list both public keys in
the genesis set, start both, and record that two validators is the minimum.

## D. Accounts without contracts

1. Throwaway custody key and native registration. The tool defaults to network 1
(mainnet); the testnet is network 2:

```
docker compose exec hypersnap ./native_register --help
```

```
docker compose exec -e HYPERSNAP_CUSTODY_PRIVATE_KEY=$(openssl rand -hex 32) hypersnap ./native_register --rpc http://127.0.0.1:3383 --network 2
```

Result 2026-11-17: `Mining 22-bit registration proof for 0x1A93...e30D at shard-0
block 801`, `Registration submitted; waiting for shard-0 inclusion`, `Native FID:
4294967296` (the first native FID). Read back over the public port:
`/v1/nativeAccount?fid=4294967296` returns the record (blockNumber 810, custody
address, `MESSAGE_TYPE_NATIVE_ONBOARD`, network `FARCASTER_NETWORK_TESTNET`, pow 22
bits), `/v1/nativeRegistration` shows `active: true`, `firstNativeFid 4294967296`,
`minDifficultyBits 22`, `anchorWindow 1024`. `storageLimitsByFid` reports unlimited
limits for the FID. `numFidRegistrations` in `/v1/info` stays 0 (it counts on-chain
registrations only). TESTED.

2. Posting a cast from the new FID: DEFERRED. The image ships no tool for it:
`submit_message` is a load generator that signs for FIDs 1..N with a fixed dev key
and has no signer on this chain. A cast needs a gasless `KEY_ADD` signed by the
custody key, then a `CastAdd` signed by that signer. Follow-up: a small script in
this repo (`tools/first-cast`) that does both against a node, after sections E
and F. Until then the account path is TESTED up to registration only.

## E. Read node joins from block 1

1. Second project on the same host, different ports, bootstrap on the validator:

```
mkdir -p ~/desoct-rn && cp docker-compose.readnode.yml validators.testnet.toml ~/desoct-rn/ && cd ~/desoct-rn && sed -i 's/"3381:3381\/tcp"/"4381:3381\/tcp"/; s/"3382:3382\/udp"/"4382:3382\/udp"/; s/127.0.0.1:3383:3383/127.0.0.1:4383:3383/; s#\(announce_address=.*\)/udp/3382/#\1/udp/4382/#' docker-compose.readnode.yml && printf 'PUBLIC_IP=%s\nTESTNET_BOOTSTRAP_PEERS=/ip4/%s/udp/3382/quic-v1\n' "$(curl -4s https://api.ipify.org)" "$(curl -4s https://api.ipify.org)" > .env && cp docker-compose.readnode.yml docker-compose.yml && ufw allow 4382/udp && docker compose -p testnet-rn up -d && sleep 60 && curl -s localhost:4381/v1/info | head -c 400
```

2. Compare heights after five minutes:

```
curl -s localhost:3381/v1/info | python3 -c 'import sys,json; print([(s["shardId"],s["maxHeight"]) for s in json.load(sys.stdin)["shardInfos"]])'; curl -s localhost:4381/v1/info | python3 -c 'import sys,json; print([(s["shardId"],s["maxHeight"]) for s in json.load(sys.stdin)["shardInfos"]])'
```

Expected: within a few blocks of each other. Record how long the read node took to
reach the tip from block 1.

Result 2026-11-17 (started 13:37 UTC): the read node reported height 1259 on all
three shards inside the first 60 s, so it synced the whole chain (1,259 blocks, 2
messages) in under a minute. At 15:39 UTC from the snapdiff VPS: validator 1382 /
read node 1383 on every shard, block delay 1 s. `/v1/mesh` on the read node lists
the validator as its one connected peer (peer id 12D3KooWAKzR...); the read node's
own peer id is 12D3KooWCU84tT4W.... `/v1/nativeAccount?fid=4294967296` answers
from the read node with the same record. TESTED.

## F. Validator set change at an announced height

1. Give the read node a key (same openssl commands as B.1, into
`~/desoct-rn/.env`, and switch it to `docker-compose.validator.yml` with
the same port edits).
2. Append to `validators.testnet.toml` in BOTH directories, with `H` = current
shard-0 height plus 2000:

```
[[consensus.validator_sets]]
effective_at = H
shard_ids = [ 0, 1, 2 ]
validator_public_keys = [
  "GENESIS PUBKEY",
  "SECOND PUBKEY",
]
```

3. Restart both before `H`, then watch past `H`:

```
docker compose restart hypersnap && (cd ~/desoct-rn && docker compose -p testnet-rn restart hypersnap) && sleep 20 && ./join.sh status
```

```
docker compose logs --since 10m hypersnap | grep -i -c propos; (cd ~/desoct-rn && docker compose -p testnet-rn logs --since 10m hypersnap | grep -i -c propos)
```

Expected: both counts above zero after `H`. Then rehearse removal the same way
(a new entry at `H2` with one key) and confirm the chain continues with one.
Record the wall-clock time each step took.

Setup 2026-11-17: second key PUBLIC2 92927a67bacafb1782e2f4e58c2fd904dcdecfdb93db1abd7e1fc532cec33d63,
read node switched to the validator compose (ports 4381/4382, announce 4382),
entry appended at `effective_at = 4_500` while the chain was at 1705 (about 45 min
of notice), seed for testnet-rn added (peer id 12D3KooWCU84tT4WrHfdyebhUs4yA38vJeu24b7ZLhNMFEqC2UE1).
Both nodes restarted at height 1891 (12:47 CST); the read node still reports
`is_validator false` before the height, as expected. Elapsed from key generation to
both restarts: about 12 minutes.

Result past height 4500, read 14:59 UTC from the snapdiff VPS: the chain HALTED at
4499 on all three shards (block delay 1694 s). testnet-0 `is_validator true`,
consensus mesh 0; testnet-rn `is_validator false`. Cause: `docker compose restart`
restarts the existing container with the environment it was created with, so the
read node never received `TESTNET_PRIVATE_KEY` or the validator compose; at 4500
the set became two keys and one signer cannot reach two thirds. The network file
(a bind mount read by the entrypoint) does update on `restart`; a changed compose
file or `.env` needs `docker compose up -d` (recreate). Recorded as a finding: a
validator set change with an absent member halts the chain at the height, and
recovers when the member appears. Fix applied: recreate testnet-rn.

Result after the recreate (15:51 UTC): testnet-rn `is_validator true`, consensus mesh 1 on
both nodes, shards 1 and 2 resumed at once with two signers (5283 at 15:51, 6373 at
16:30, delay 0 to 1). Shard 0 (the block shard) stayed at 4499 on both nodes. Both
logs repeat, every round: `Unable to find last shard witness for block height=4500`,
`Received block with wrong number of shard witnesses: 0`, `Stored proposed body
failed validation during GetValue recovery height=[0] 4500 round=NN`.

Root cause, read from the stored blocks over gRPC (`HubService/GetBlocks`): every
block since genesis, block 100 and block 4499 alike, carries the same
`shardWitnessesHash` (`rxNJufX5...`, the hash of an empty list) and an empty
`shardWitness`. In `src/consensus/proposer.rs` (`collect_confirmed_shard_witnesses`,
decoupled path) block 1 asks each data shard store for chunk 1; on a fresh chain the
data shards have not committed chunk 1 yet, there is no previous witness to carry
over, so block 1 is proposed with zero witnesses. Every later block reads the
previous block's witness list to find the next shard height, finds none, logs
"Unable to find last shard witness" and proposes zero witnesses again. A single
validator never validates its own proposal, so the chain ran 4,499 blocks like
this unnoticed. The moment a second validator validated a proposal
(`shard_chunk_witnesses.len() != num_shards`) the block shard halted for good.
Nothing in the data shards is affected, and no restart can repair it: the stored
blocks have no witnesses to continue from.

Decision: regenesis with BOTH keys in the genesis set. Two validators validate each
other's block 1; the empty first proposal fails, the next round finds the committed
shard chunks and block 1 carries two witnesses. Cost: a four-hour chain with one
throwaway account. Reported upstream as a fresh-network bug (see
`docs/upstream-issue-empty-witnesses.md`). This is exactly the class of edge case
the testnet exists to find. TESTED as a finding; the set-change rehearsal itself is
repeated after regenesis with a third key.

Regenesis result (second genesis, about 16:45 UTC 2026-11-17): both databases removed,
both nodes recreated with `up -d`, both `is_validator true`; 90 s later all three
shards at 88 with delay 0 on both nodes. `HubService/GetBlocks` for block 2 shows
`shardChunkWitnesses` with two entries (shardIndex 1 and 2, blockNumber 2, real
`shardHash` values). The two-validator genesis carries witnesses from the first
blocks. TESTED. The chain that counts starts here; the first chain (13:16 to 16:30
UTC) is discarded.

Set change on the second genesis (F repeated): testnet-2 created in `~/desoct-2`
(ports 5381/5382/5383, validator compose, key in `.env`, started with `up -d` as a
read node, synced to 4393 inside its first minute). PUBLIC3
d0383eb4675259a972f695d11c794d0a04da3bb72654e00b0616a33969b7c04d, peer id
12D3KooWPqAiKeG2EPkFvWWoYL92542ysJZ4xFtSE1gaZYstnMwA. Entry appended at
`effective_at = 6_000` while the chain was at 4393 (27 minutes of notice), seed
added, file synced to all three directories, all three nodes restarted (network
file only, so `restart`) at height 4622. Elapsed from key generation to the last
restart: about 10 minutes.

Result past 6000 (read from the snapdiff VPS, about 17:55 UTC): no halt. hst0 at 6157
and hst1 at 6158 on all shards with delay 0, consensus mesh 2 on both (three
validators), testnet-2's peer id in both mesh lists. Validator addition at an
announced height: TESTED. Side finding: a node's peer id derives from its consensus
key, so testnet-1's peer id changed when it was recreated with its key
(12D3KooWCU84... as a keyless read node, 12D3KooWKgXEoET5... as a validator); the
seed line was corrected. Operators must report the peer id from a node that already
runs with its final key, which `join.sh validator` guarantees by writing the key
before the first start.

Removal: entry appended at `effective_at = 7_700` (announced at 6179) listing the
two genesis keys only; testnet-2 keeps running and its seed line stays.

Result past 7700: hst0 at 7807 and hst1 at 7808 with delay 0 (watch from the snapdiff
VPS); after the restarts testnet-2 reports `is_validator false` at height 8180 while
still following the chain. Validator removal at an announced height: TESTED.

Caveat recorded: the three restarts for the removal ran at about height 8084, AFTER
the effective height 7700. Between 7700 and the restart all three nodes still ran the
previous file (three validators), so the chain never saw a disagreement; after the
restarts all three switched to the two-key set together and testnet-2 stopped
proposing (447 proposals in the ten minutes before its restart, expected 0 after).
This worked only because every node was late by the same amount. In operation,
nodes restart before the height; a node that is late while others are on time is
the halt case seen on the first chain.

Section F summary for the RFC: key generation to a running read node about 10
minutes; set change notice used in rehearsal 27 minutes (operation: 48 hours);
addition and removal both passed without a pause when every node held the new file
before the height.

## G. snapdiff sees the network

Lines for `/srv/snapdiff/.env` on the snapdiff VPS (handed over, edited by the
operator, then `sudo systemctl restart snapdiff`): add the labels `testnet-0` and
`testnet-rn` to `NODES`, and for each a `NODE_TESTNET_0_URL` / `NODE_TESTNET_0_NETWORK=hypersnap-testnet`
pair (same for `TESTNET_RN`). Verify the dashboard shows the third network with
two nodes, then stop the read node for five minutes and confirm a node-scope stall
is recorded, not a network-scope one.

Output:

```
(paste)
```

## H. Teardown or keep

If the rehearsal passes and the move to the permanent host follows within days,
keep the VPS running (it is the live genesis validator until Phase 3). Otherwise:

```
docker compose down && (cd ~/desoct-rn && docker compose -p testnet-rn down) && shred -u testnet-validator.pem .env
```

then destroy the VPS at the provider.

## Results summary

| Check | Result | Date |
|---|---|---|
| Single validator produces blocks | TESTED, but with empty shard witnesses (bug); two-validator genesis used | 2026-11-17 |
| Block time measured | 1.0 s | 2026-11-17 |
| Native FID registered and cast read back | registration TESTED (first chain); cast DEFERRED (needs signer tool) | 2026-11-17 |
| Read node reached the tip from block 1 (duration) | under 60 s at 1,259 blocks; under 60 s at 4,393 blocks | 2026-11-17 |
| Validator added at announced height | TESTED (second genesis, height 6000, no pause) | 2026-11-17 |
| Validator removed at announced height | TESTED (height 7700; restarts were late but consistent) | 2026-11-17 |
| snapdiff shows `hypersnap-testnet` | TESTED: Testnet tab, both validators, stalls recorded during the halt | 2026-11-17 |
