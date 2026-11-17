#!/usr/bin/env node
// first-cast: prove a Hypersnap testnet account can post.
//
// Flow (every rule below was read from farcasterorg/hypersnap on 2026-11-17):
//   1. Look up the native FID for the custody address (/v1/nativeAccount?custody=0x...).
//      Register first with the node's own tool if there is none:
//        docker compose exec -e HYPERSNAP_CUSTODY_PRIVATE_KEY=<hex> hypersnap ./native_register --network 2
//   2. Generate an ed25519 signer. Build a gasless KEY_ADD (MessageType 16):
//        - KeyAddBody: key, key_type 1, custody_signature = EIP-712 "KeyAdd" signed by the custody
//          key (domain "Farcaster KeyAdd" v1, chainId 1), deadline and nonce, metadata = ABI-encoded
//          SignedKeyRequestMetadata whose signature is EIP-712 "SignedKeyRequest" by the same custody
//          key (requestFid = our own FID), metadata_type 1, scopes, ttl.
//        - The outer Message is hashed with blake3 (20 bytes) and signed ed25519 by the NEW key
//          (src/core/validations/message.rs: every non-onboard message needs an ed25519 signature;
//          src/storage/store/block_engine.rs skips the active-signer check for KEY_ADD because the
//          merge path authenticates it through the custody signature).
//   3. POST it to /v1/submitMessage as protobuf bytes, poll /v1/signersByFid until the key shows.
//   4. Build a CAST_ADD signed by the signer, submit, poll /v1/castsByFid until it shows.
//
// Secrets: the custody key comes from HYPERSNAP_CUSTODY_PRIVATE_KEY (hex, with or without 0x) and is
// never printed. The signer's private key is written to signer.key (mode 600) next to this script,
// never printed; it only authorizes messages on a worthless testnet account, and the custody key
// can revoke it.
//
// Usage:
//   HYPERSNAP_CUSTODY_PRIVATE_KEY=<hex> node first-cast.mjs --node https://hst0.schmidtiest.xyz [--text "hello"] [--signer <hex> | --signer-file <path> | --new-signer]
//   node first-cast.mjs --dry-run      (no network: builds both messages with a throwaway custody key and verifies every signature)
import { privateKeyToAccount } from "viem/accounts";
import { encodeAbiParameters, hashTypedData, recoverTypedDataAddress, toHex } from "viem";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { blake3 } from "@noble/hashes/blake3";
import { randomBytes } from "node:crypto";
import protobuf from "protobufjs";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const FARCASTER_EPOCH_S = 1609459200;
const NETWORK_TESTNET = 2;
const MESSAGE_TYPE_CAST_ADD = 1;
const MESSAGE_TYPE_KEY_ADD = 16;
const KEY_DOMAIN = { name: "Farcaster KeyAdd", version: "1", chainId: 1 };
const KEY_ADD_TYPES = {
  KeyAdd: [
    { name: "fid", type: "uint256" },
    { name: "key", type: "bytes" },
    { name: "keyType", type: "uint32" },
    { name: "scopes", type: "uint32[]" },
    { name: "ttl", type: "uint32" },
    { name: "nonce", type: "uint32" },
    { name: "deadline", type: "uint256" },
  ],
};
const SIGNED_KEY_REQUEST_TYPES = {
  SignedKeyRequest: [
    { name: "requestFid", type: "uint256" },
    { name: "key", type: "bytes" },
    { name: "deadline", type: "uint256" },
  ],
};
const METADATA_ABI = [
  {
    type: "tuple",
    components: [
      { name: "requestFid", type: "uint256" },
      { name: "requestSigner", type: "address" },
      { name: "signature", type: "bytes" },
      { name: "deadline", type: "uint256" },
    ],
  },
];
// Scopes a gasless key may hold (src/core/validations/key.rs validate_key_add_scopes). Casts,
// reactions, links and user data are enough for a client test.
const SCOPES = [1, 2, 3, 4, 5, 6, 11];
const TTL_SECONDS = 30 * 24 * 3600; // max is 90 days

// Only the fields this tool writes, with the wire numbers from proto/definitions/message.proto.
// Unknown fields never round-trip through here, so nothing else is needed.
const SCHEMA = `
syntax = "proto3";
message CastId { uint64 fid = 1; bytes hash = 2; }
message CastAddBody {
  repeated string embeds_deprecated = 1;
  repeated uint64 mentions = 2;
  oneof parent { CastId parent_cast_id = 3; string parent_url = 7; }
  string text = 4;
  repeated uint32 mentions_positions = 5;
  uint32 type = 8;
  uint32 format_version = 9;
}
message KeyAddBody {
  bytes key = 1;
  uint32 key_type = 2;
  bytes custody_signature = 3;
  uint32 deadline = 4;
  uint32 nonce = 5;
  bytes metadata = 6;
  uint32 metadata_type = 7;
  bytes registration_tx_hash = 8;
  repeated int32 scopes = 9;
  uint32 ttl = 10;
}
message MessageData {
  uint32 type = 1;
  uint64 fid = 2;
  uint32 timestamp = 3;
  uint32 network = 4;
  oneof body { CastAddBody cast_add_body = 5; KeyAddBody key_add_body = 19; }
}
message Message {
  MessageData data = 1;
  bytes hash = 2;
  uint32 hash_scheme = 3;
  bytes signature = 4;
  uint32 signature_scheme = 5;
  bytes signer = 6;
  optional bytes data_bytes = 7;
}`;
const root = protobuf.parse(SCHEMA, { keepCase: true }).root;
const MessageData = root.lookupType("MessageData");
const Message = root.lookupType("Message");

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : [])).filter((x) => x.length));
const dryRun = args["dry-run"] === true;
const nodeUrl = (args.node ?? "").replace(/\/$/, "");
const text = typeof args.text === "string" ? args.text : `first cast from a native testnet account, ${new Date().toISOString()}`;
const hex = (u8) => Buffer.from(u8).toString("hex");
const fromHex = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));
const fcNow = () => Math.floor(Date.now() / 1000) - FARCASTER_EPOCH_S;
const log = (...m) => console.log(...m);
const die = (m) => {
  console.error(m);
  process.exit(1);
};

const custodyHex = dryRun ? hex(randomBytes(32)) : process.env.HYPERSNAP_CUSTODY_PRIVATE_KEY;
if (!custodyHex) die("HYPERSNAP_CUSTODY_PRIVATE_KEY is not set");
if (!dryRun && !nodeUrl) die("--node https://host is required (or --dry-run)");
const custody = privateKeyToAccount(`0x${custodyHex.replace(/^0x/, "")}`);
const signerPriv = typeof args.signer === "string" ? fromHex(args.signer) : ed.utils.randomPrivateKey();
const signerPub = ed.getPublicKey(signerPriv);

async function api(path, init) {
  const res = await fetch(`${nodeUrl}${path}`, init);
  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {}
  return { status: res.status, json, body };
}

/** Wrap MessageData in a signed Message: blake3-20 hash, ed25519 over the hash by `priv`. */
function sign(dataFields, priv) {
  const err = MessageData.verify(dataFields);
  if (err) throw new Error(`MessageData: ${err}`);
  const dataBytes = MessageData.encode(MessageData.create(dataFields)).finish();
  const hash = blake3(dataBytes, { dkLen: 20 });
  const signature = ed.sign(hash, priv);
  const msg = Message.create({ data: dataFields, hash, hash_scheme: 1, signature, signature_scheme: 1, signer: ed.getPublicKey(priv), data_bytes: dataBytes });
  return { bytes: Message.encode(msg).finish(), hash, dataBytes, signature };
}

async function buildKeyAdd(fid) {
  const deadline = BigInt(fcNow() + 3600);
  const nonce = 1;
  const keyHex = toHex(signerPub);
  const custodySignature = await custody.signTypedData({ domain: KEY_DOMAIN, types: KEY_ADD_TYPES, primaryType: "KeyAdd", message: { fid: BigInt(fid), key: keyHex, keyType: 1, scopes: SCOPES, ttl: TTL_SECONDS, nonce, deadline } });
  const requestSignature = await custody.signTypedData({ domain: KEY_DOMAIN, types: SIGNED_KEY_REQUEST_TYPES, primaryType: "SignedKeyRequest", message: { requestFid: BigInt(fid), key: keyHex, deadline } });
  const metadata = encodeAbiParameters(METADATA_ABI, [{ requestFid: BigInt(fid), requestSigner: custody.address, signature: requestSignature, deadline }]);
  const data = {
    type: MESSAGE_TYPE_KEY_ADD,
    fid,
    timestamp: fcNow(),
    network: NETWORK_TESTNET,
    key_add_body: { key: signerPub, key_type: 1, custody_signature: fromHex(custodySignature), deadline: Number(deadline), nonce, metadata: fromHex(metadata), metadata_type: 1, scopes: SCOPES, ttl: TTL_SECONDS },
  };
  return { ...sign(data, signerPriv), custodySignature, requestSignature, deadline };
}

function buildCast(fid) {
  const data = { type: MESSAGE_TYPE_CAST_ADD, fid, timestamp: fcNow(), network: NETWORK_TESTNET, cast_add_body: { text, type: 0, format_version: 0 } };
  return sign(data, signerPriv);
}

async function waitFor(label, check, tries = 30, everyMs = 2000) {
  for (let i = 0; i < tries; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  die(`${label}: not visible after ${(tries * everyMs) / 1000} s`);
}

if (dryRun) {
  // Offline proof of the signing path: both messages encode, every signature verifies, and the
  // custody address recovers from both EIP-712 signatures exactly as the node will recover it.
  const fid = 4294967296;
  const k = await buildKeyAdd(fid);
  const decoded = Message.decode(k.bytes);
  const okEd = ed.verify(decoded.signature, decoded.hash, decoded.signer);
  const okHash = hex(blake3(decoded.data_bytes, { dkLen: 20 })) === hex(decoded.hash);
  const recovered = await recoverTypedDataAddress({ domain: KEY_DOMAIN, types: KEY_ADD_TYPES, primaryType: "KeyAdd", message: { fid: BigInt(fid), key: toHex(signerPub), keyType: 1, scopes: SCOPES, ttl: TTL_SECONDS, nonce: 1, deadline: k.deadline }, signature: k.custodySignature });
  const recovered2 = await recoverTypedDataAddress({ domain: KEY_DOMAIN, types: SIGNED_KEY_REQUEST_TYPES, primaryType: "SignedKeyRequest", message: { requestFid: BigInt(fid), key: toHex(signerPub), deadline: k.deadline }, signature: k.requestSignature });
  const c = buildCast(fid);
  const cd = Message.decode(c.bytes);
  const okCast = ed.verify(cd.signature, cd.hash, cd.signer) && cd.data.cast_add_body.text === text && cd.data.network === NETWORK_TESTNET;
  log("dry run");
  log("  key_add bytes", k.bytes.length, "ed25519 ok", okEd, "hash ok", okHash, "custody recovers", recovered === custody.address, "request recovers", recovered2 === custody.address);
  log("  cast bytes", c.bytes.length, "ok", okCast);
  log("  key_add typed-data hash", hashTypedData({ domain: KEY_DOMAIN, types: KEY_ADD_TYPES, primaryType: "KeyAdd", message: { fid: BigInt(fid), key: toHex(signerPub), keyType: 1, scopes: SCOPES, ttl: TTL_SECONDS, nonce: 1, deadline: k.deadline } }).slice(0, 18) + "...");
  process.exit(okEd && okHash && okCast && recovered === custody.address && recovered2 === custody.address ? 0 : 2);
}

// 1. FID for this custody address.
const acct = await api(`/v1/nativeAccount?custody=${custody.address}`);
if (acct.status !== 200 || !acct.json?.fid) die(`no native account for ${custody.address} (HTTP ${acct.status}). Register first:\n  docker compose exec -e HYPERSNAP_CUSTODY_PRIVATE_KEY=<hex> hypersnap ./native_register --network 2`);
const fid = Number(acct.json.fid);
log(`custody ${custody.address} -> native FID ${fid}`);
// The signer's private key goes to a file (mode 600), never to the screen: operators paste
// terminal output into chats. Reuse it with --signer-file (default signer.key next to this script).
const signerFile = typeof args["signer-file"] === "string" ? args["signer-file"] : new URL("./signer.key", import.meta.url).pathname;
if (typeof args.signer !== "string") {
  const { writeFileSync, existsSync } = await import("node:fs");
  if (existsSync(signerFile) && !args["new-signer"]) {
    die(`${signerFile} exists; pass --signer-file <path> for a new one, --new-signer to overwrite it, or --signer <hex> to reuse a key`);
  }
  writeFileSync(signerFile, `${hex(signerPriv)}\n`, { mode: 0o600 });
}
log(`signer public key ${hex(signerPub)}; private key written to ${signerFile} (mode 600, reuse with --signer $(cat ${signerFile}))`);

// 2. Gasless KEY_ADD, unless this signer is already active.
const signers = await api(`/v1/signersByFid?fid=${fid}`);
const have = JSON.stringify(signers.json ?? "").toLowerCase().includes(hex(signerPub));
if (have) log("signer already registered, skipping KEY_ADD");
else {
  const k = await buildKeyAdd(fid);
  const r = await api(`/v1/submitMessage`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: k.bytes });
  if (r.status !== 200) die(`KEY_ADD rejected: HTTP ${r.status} ${r.body.slice(0, 400)}`);
  log(`KEY_ADD accepted, hash 0x${hex(k.hash)}; waiting for the signer to be merged`);
  // signersByFid may list gasless keys in a shape this tool does not know; treat it as a hint
  // and let the cast submission be the real test (the node rejects a cast until the key merged).
  for (let i = 0; i < 10; i++) {
    if (JSON.stringify((await api(`/v1/signersByFid?fid=${fid}`)).json ?? "").toLowerCase().includes(hex(signerPub))) {
      log("signer visible in signersByFid");
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// 3. One cast, retried while the node still rejects it (key not merged yet).
let c;
let r2;
for (let i = 0; i < 30; i++) {
  c = buildCast(fid);
  r2 = await api(`/v1/submitMessage`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: c.bytes });
  if (r2.status === 200) break;
  if (i === 0) log(`cast not accepted yet (HTTP ${r2.status} ${r2.body.slice(0, 160).replace(/\s+/g, " ")}); retrying for up to 60 s`);
  await new Promise((r) => setTimeout(r, 2000));
}
if (r2.status !== 200) die(`CAST_ADD rejected: HTTP ${r2.status} ${r2.body.slice(0, 400)}`);
log(`cast accepted, hash 0x${hex(c.hash)}; waiting for it in castsByFid`);
await waitFor("cast", async () => JSON.stringify((await api(`/v1/castsByFid?fid=${fid}`)).json ?? "").toLowerCase().includes(hex(c.hash)));
const casts = await api(`/v1/castsByFid?fid=${fid}`);
const mine = (casts.json?.messages ?? []).find((m) => (m.hash ?? "").toLowerCase() === `0x${hex(c.hash)}`);
log("read back:", JSON.stringify({ fid: mine?.data?.fid, text: mine?.data?.castAddBody?.text, network: mine?.data?.network, hash: mine?.hash }));
log("done: the account can post");
