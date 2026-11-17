# Telegram post: testnet group

Status: DRAFT until section F of the rehearsal passes and the repo is public. Replace
the two TBD values, then paste the block below as one message. Plain text on purpose
(Telegram markdown is unreliable across clients).

```
Hypersnap testnet is up.

What it is: a Hypersnap chain with fc_network Testnet, three shards like mainnet, 1 s blocks, genesis 2026-11-17 (second genesis; the first one taught us a bug, reported upstream). Accounts are native (custody proof of work, no contract, no fnames). First native FID: 4294967296. Code is upstream farcasterorg/hypersnap:latest, unchanged. No value, resettable with 7 days notice.

What exists today: two validators (testnet-0, testnet-1), both mine, on one server. Public API: https://hst0.schmidtiest.xyz/v1/info. Health page: https://snapdiff.schmidtiest.xyz/?net=testnet

What I am looking for, in this order:
1. Two more validators to start. With four total the chain survives one being down; today it halts whenever my server does. Needs 4 vCPU, 8 GB RAM, 100 GB SSD, static IPv4, UDP 3382 and TCP 3381 open, always on.
2. Read nodes. 2 vCPU, 4 GB, 50 GB, UDP 3382 reachable. Gives you a testnet API endpoint for your own client.

How to join, about ten minutes:
1. git clone https://github.com/schmrdty/hypersnap-testnet, then ./join.sh validator or ./join.sh readnode. It generates your key (validators), writes the config, pulls the image, starts the node. Nothing leaves your machine except the image pull.
2. Two minutes later: ./join.sh status. Shards 0, 1, 2 should be climbing. The rehearsal read node synced the whole chain in under a minute.
3. Open an operator issue from the repo template: public IP, peer id, and for validators the consensus PUBLIC key the script printed. Never post the private key, the .env or the .pem.

What happens next: read nodes are live as soon as they sync. Validators are added in batches: one pull request to validators.testnet.toml with an effective height announced 48 hours ahead, everyone pulls and restarts before it. First batch goes in when two candidates have filed. Testnet tracks the stable latest tag; nightly test windows get announced with a start, a tag and an end.

Full RFC and runbook: in the repo. Questions here or in the repo issues.
```
