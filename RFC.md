# RFC: a community-run Hypersnap testnet

Status: DRAFT, not published. Fields marked TBD are filled after the rehearsal
(`docs/rehearsal-2026-11.md`) and before the first public post.

## 1. Why

Hypersnap mainnet is where real accounts live. There is no place to try a node
upgrade, a validator set change, a native registration flow, or an API change
before it reaches mainnet. Four patch releases shipped in one afternoon on
2026-11-14 and operators learned about each one by watching other nodes. A testnet
run by operators gives everyone a rehearsal space that nobody has to protect.

## 2. What exists

| Item | Value |
|---|---|
| Genesis | 2026-11-17, second genesis about 16:45 UTC (the first, single-validator chain was discarded the same day) |
| `fc_network` | Testnet (2) |
| Block time | 1 s (measured: 60 blocks in 61 s) |
| Validators at genesis | 2: testnet-0 and testnet-1, both operated by the author on one dedicated server. Two because a lone validator commits block 1 without shard witnesses and the block shard can never recover once a peer validates (found 2026-11-17, upstream issue 88) |
| Accounts | native registration from block 1, no contracts, no fnames |
| Public API | `https://hst0.schmidtiest.xyz/v1/info` (genesis validator) and `https://hst1.schmidtiest.xyz/v1/info` (second genesis validator) |
| Health page | https://snapdiff.schmidtiest.xyz/?net=testnet |
| Repo | https://github.com/schmrdty/hypersnap-testnet: compose files, `join.sh`, `validators.testnet.toml`, runbook |

## 3. Who is wanted

Goal for the first month: four validators, then at least two read nodes, six or more
nodes besides testnet-0.

| Role | What you commit to | Minimums |
|---|---|---|
| Validator | A machine that stays up, a static IP, UDP 3382 and TCP 3381 open, applying validator set changes before each announced height | 4 vCPU, 8 GB RAM, 100 GB SSD |
| Read node | A machine that follows the chain and, if you like, serves its API to your own clients | 2 vCPU, 4 GB RAM, 50 GB SSD |

Quorum: with N validators, floor((N-1)/3) may be offline at once. Until there are
four, the chain halts whenever testnet-0 is down. The first three validator
operators are therefore the ones who make the testnet real.

## 4. How to join

1. Clone the repo, run `./join.sh validator` or `./join.sh readnode`.
2. Open an operator issue from the template: public IP, peer id, and for validators
   the consensus public key the script printed. Nothing secret is ever posted.
3. Read nodes are on the network as soon as they sync. Validators are added in
   batches: one pull request to `validators.testnet.toml` with an effective height
   announced 48 hours ahead; everyone pulls and restarts before it.

## 5. Policies

1. Releases: the testnet runs the stable `latest` image. Nightly windows are
   announced with a start, an image tag and an end; after the end everyone returns
   to `latest`.
2. Resets: the chain may be restarted from a new genesis with seven days notice.
   Nothing on it has value; all data is public and disposable.
3. Maintainer: the author holds `validators.testnet.toml`. Set changes are pull
   requests with the height in the title. The upstream maintainer is informed of
   every change and may veto anything that diverges from protocol rules.
4. Conduct: operators who spam the chain or run modified consensus code are
   removed at the next batch.

## 6. What this is not

Not a staking or reward program. Not a second mainnet. Not an upstream project:
the code is upstream Hypersnap unchanged; this repo holds configuration only.

## 7. Open questions for the community

1. Block time: keep the 1 s default or slow it down to lower validator load?
2. Should the testnet mirror mainnet's validator count (eight) as a ceiling?
3. Which channel carries height announcements: this repo's issues, a cast, or both?

## 8. Contact

TBD (channel chosen by the author before publication).
