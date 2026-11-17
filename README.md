# hypersnap-testnet

Configuration and operator tooling for a community-run Hypersnap testnet. The node
software is upstream [farcasterorg/hypersnap](https://github.com/farcasterorg/hypersnap)
unchanged; this repository holds only the network file, compose files, a join
script and the runbook.

Status: TESTED as of 2026-11-17 (`docs/rehearsal-2026-11.md`: two-validator genesis
producing blocks with shard witnesses, a read node syncing from block 1, a validator
added and removed at announced heights). It becomes EXERCISED when a node not run by
the author syncs from the public chain, and OPEN when the RFC is posted and the first
outside operator's node is in sync.

| File | Purpose |
|---|---|
| `RFC.md` | Why the testnet exists, who is wanted, policies (readable version) |
| `RFC-ISSUE.md` | The same as a formal GitHub issue body: summary, motivation, specification, procedure, governance, security, open questions |
| `TELEGRAM-POST.md` | The operator call for the Telegram group, plain text |
| `RUNBOOK.md` | Operator steps: join, set changes, upgrades, troubleshooting |
| `join.sh` | `validator`, `readnode`, `status` |
| `docker-compose.validator.yml`, `docker-compose.readnode.yml` | Node definitions; `join.sh` copies one to `docker-compose.yml` |
| `validators.testnet.toml` | Network-wide file appended to every node's config: validator sets, topic cutovers, native registration heights, discovery seeds |
| `tools/first-cast/` | Registers a gasless signer for a native account and posts one cast; the end-to-end client test |
| `docs/rehearsal-2026-11.md` | The rehearsal checklist and its results |
| `.github/ISSUE_TEMPLATE/operator.yml` | Operator registration |

Secrets never enter this repo: `.env`, `*.pem` and `.rocks*` are ignored.
