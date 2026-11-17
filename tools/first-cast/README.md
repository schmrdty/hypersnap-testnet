# first-cast

Proves a native Hypersnap testnet account can post: registers an ed25519 signer with a
gasless `KEY_ADD` (custody-signed EIP-712, no contract), posts one cast with it, and
reads the cast back from the node. The node image ships no tool for this
(`submit_message` is a load generator with a fixed dev key).

Status: TESTED end to end on 2026-11-17 against `https://hst0.schmidtiest.xyz`: native FID
4294967296, `KEY_ADD` accepted (hash 0xfe46555b...), signer visible in `signersByFid`,
cast accepted (hash 0xb12dbecf...) and read back from `castsByFid` with network
`FARCASTER_NETWORK_TESTNET`. It becomes EXERCISED when an outside operator runs it
against their own node.

## Steps

1. Pick a custody key (any 32-byte hex; it only ever controls a worthless testnet
   account) and register the account on a node. On the node host, from the compose
   directory:

```
export HYPERSNAP_CUSTODY_PRIVATE_KEY=$(openssl rand -hex 32) && echo "custody key set in this shell only" && docker compose exec -e HYPERSNAP_CUSTODY_PRIVATE_KEY=$HYPERSNAP_CUSTODY_PRIVATE_KEY hypersnap ./native_register --network 2
```

   Prints `Native FID: 4294967...` after a short proof of work. Keep the shell open:
   the same variable feeds step 2. Write the key down if you want the account again.

2. Run the tool against a node's public API. With Node 20 or newer installed:

```
npm ci && HYPERSNAP_CUSTODY_PRIVATE_KEY=$HYPERSNAP_CUSTODY_PRIVATE_KEY node first-cast.mjs --node https://hst0.schmidtiest.xyz --text "hello testnet"
```

   Without Node, from this directory on a host with Docker:

```
docker run --rm -e HYPERSNAP_CUSTODY_PRIVATE_KEY -v "$PWD":/w -w /w node:22 sh -c 'npm ci --no-audit --no-fund >/dev/null && node first-cast.mjs --node https://hst0.schmidtiest.xyz --text "hello testnet"'
```

   Expected output ends with the cast read back and `done: the account can post`.
   The signer's private key is written to `signer.key` next to the script (mode 600,
   gitignored), never printed. Post again without a second `KEY_ADD` with
   `--signer $(cat signer.key)`; a second account on the same machine needs
   `--signer-file other.key` or `--new-signer`.

3. Offline check, no network and no real key: `node first-cast.mjs --dry-run`.

## What the node checks (why each field is there)

| Field | Rule (file in farcasterorg/hypersnap) |
|---|---|
| Outer `Message` | blake3-20 hash of `data_bytes`, ed25519 signature over the hash by the message signer (`src/core/validations/message.rs`). For `KEY_ADD` the signer is the new key itself; the active-signer check is skipped for key messages (`src/storage/store/block_engine.rs`) |
| `KeyAddBody.custody_signature` | EIP-712 `KeyAdd(fid,key,keyType,scopes,ttl,nonce,deadline)`, domain `Farcaster KeyAdd` v1 chainId 1, must recover to the FID's custody address (`gasless_key_merge.rs`, native custody via `native_registration::account`) |
| `metadata` | ABI tuple `(uint256 requestFid, address requestSigner, bytes signature, uint256 deadline)`; `signature` is EIP-712 `SignedKeyRequest(requestFid,key,deadline)` by the custody of `requestFid`, here our own FID |
| `nonce` | strictly greater than the stored user nonce (starts at 0), so a first add uses 1 |
| `scopes` | non-empty, only data message types; `KEY_ADD` and `KEY_REMOVE` can never be scopes |
| `ttl` | 1 second to 90 days; the key expires on a sliding window |
| `deadline` | Farcaster epoch seconds, at or after the message timestamp |
| `network` | 2 (Testnet); a testnet node accepts any network value, mainnet accepts only 1 |
