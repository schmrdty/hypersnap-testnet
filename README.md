# hypersnap-testnet

Configuration and operator tooling for a community-run Hypersnap testnet. The node
software is upstream [farcasterorg/hypersnap](https://github.com/farcasterorg/hypersnap)
unchanged; this repository holds only the network file, compose files, a join
script and the runbook.

Status: running since 2026-11-17 with two validators and open for operators. The RFC
is [issue 1](https://github.com/schmrdty/hypersnap-testnet/issues/1); the rehearsal
record is `docs/rehearsal-2026-11.md` (two-validator genesis with shard witnesses, a
read node syncing from block 1, a validator added and removed at announced heights,
a native account posting a cast). Health page:
https://snapdiff.schmidtiest.xyz/?net=testnet

| File | Purpose |
|---|---|
| `RFC.md` | Why the testnet exists, who is wanted, policies (readable version of issue 1) |
| `RFC-ISSUE.md` | The text of issue 1: summary, motivation, specification, procedure, governance, security, open questions |
| `OPERATOR-POST.md` | The operator call, plain text for chat groups |
| `RUNBOOK.md` | Operator steps: join, set changes, upgrades, troubleshooting |
| `join.sh` | `validator`, `readnode`, `status` |
| `docker-compose.validator.yml`, `docker-compose.readnode.yml` | Node definitions; `join.sh` copies one to `docker-compose.yml` |
| `validators.testnet.toml` | Network-wide file appended to every node's config: validator sets, topic cutovers, native registration heights, discovery seeds |
| `tools/first-cast/` | Registers a gasless signer for a native account and posts one cast; the end-to-end client test |
| `docs/rehearsal-2026-11.md` | The rehearsal checklist and its results |
| `.github/ISSUE_TEMPLATE/operator.yml` | Operator registration |

Secrets never enter this repo: `.env`, `*.pem` and `.rocks*` are ignored.
