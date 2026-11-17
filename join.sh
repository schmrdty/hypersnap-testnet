#!/usr/bin/env bash
# Hypersnap testnet: join as a validator or a read node.
#
# Usage, from a clone of this repo on the host that will run the node:
#   ./join.sh validator      generates a consensus key, writes .env and docker-compose.yml, starts the node
#   ./join.sh readnode       writes .env and docker-compose.yml, starts the node
#   ./join.sh status         prints /v1/info heights and the node's peer id
#
# What it never does: send anything anywhere except `docker compose pull`, print the
# private key after generation, or touch an existing .env without asking.
set -euo pipefail

cd "$(dirname "$0")"
ROLE="${1:-}"
HERE="$(pwd)"

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1"; exit 1; }; }
need docker; need openssl; need curl; need awk
docker compose version >/dev/null 2>&1 || { echo "missing: docker compose plugin"; exit 1; }

seeds_from_toml() {
  # Discovery seeds minus the /p2p/ suffix, comma separated, for the legacy bootstrap_peers string.
  awk '/^bootstrap_peers = \[/{f=1;next} f&&/^\]/{f=0} f&&/^ *"/{gsub(/^ *"|",? *$/,""); sub(/\/p2p\/.*$/,""); print}' validators.testnet.toml | paste -sd, -
}

detect_ip() {
  local ip
  ip="$(curl -4s -m 5 https://api.ipify.org || true)"
  read -r -p "Public IPv4 of this host [${ip}]: " answer
  echo "${answer:-$ip}"
}

write_env() {
  if [ -f .env ]; then
    read -r -p ".env exists. Overwrite it? [y/N] " yn
    [ "${yn:-N}" = "y" ] || { echo "kept existing .env"; return; }
  fi
  umask 077
  {
    echo "PUBLIC_IP=$1"
    echo "TESTNET_BOOTSTRAP_PEERS=$(seeds_from_toml)"
    [ -n "${2:-}" ] && echo "TESTNET_PRIVATE_KEY=$2"
  } > .env
  echo "wrote .env (mode 600)"
}

case "$ROLE" in
  validator)
    if grep -q "GENESIS_VALIDATOR_PUBLIC_KEY" validators.testnet.toml; then
      echo "validators.testnet.toml still has placeholders: this clone predates genesis. Pull the latest copy first."; exit 1
    fi
    ip="$(detect_ip)"
    umask 077
    openssl genpkey -algorithm ed25519 -out testnet-validator.pem
    priv="$(openssl pkey -in testnet-validator.pem -text -noout | awk '/priv:/{f=1;next}/pub:/{f=0} f{p=p $0} END{gsub(/[: ]/,"",p);print p}')"
    pub="$(openssl pkey -in testnet-validator.pem -text -noout | awk '/pub:/{f=1;next} f{p=p $0} END{gsub(/[: ]/,"",p);print p}')"
    [ "${#priv}" = 64 ] && [ "${#pub}" = 64 ] || { echo "key parse failed (got ${#priv}/${#pub} hex chars)"; exit 1; }
    write_env "$ip" "$priv"
    unset priv
    cp docker-compose.validator.yml docker-compose.yml
    echo
    echo "Consensus PUBLIC key (share this in your operator issue): $pub"
    echo "Private key: in .env and testnet-validator.pem only. Back the .pem up offline. Never post it."
    echo
    echo "Until your key is in a validator set, this node runs as a read node. Starting it now."
    docker compose pull hypersnap && docker compose up -d
    ;;
  readnode)
    if grep -q "GENESIS_VALIDATOR_PUBLIC_KEY" validators.testnet.toml; then
      echo "validators.testnet.toml still has placeholders: this clone predates genesis. Pull the latest copy first."; exit 1
    fi
    ip="$(detect_ip)"
    write_env "$ip" ""
    cp docker-compose.readnode.yml docker-compose.yml
    docker compose pull hypersnap && docker compose up -d
    ;;
  status)
    curl -s -m 10 localhost:3381/v1/info | python3 -c 'import sys,json; d=json.load(sys.stdin); print("version", d.get("version")); [print("shard", s["shardId"], "height", s["maxHeight"], "delay", s.get("blockDelay")) for s in d.get("shardInfos", [])]'
    curl -s -m 10 localhost:3381/v1/mesh | python3 -c 'import sys,json; m=json.load(sys.stdin)["self"]; print("peer id", m["peer_id"], "network", m["network"], "validator", m["is_validator"], "gossip", m["gossip_address"])'
    exit 0
    ;;
  *)
    echo "usage: $0 validator|readnode|status"; exit 1
    ;;
esac

echo
echo "Started. In two minutes run: ./join.sh status"
echo "Then open an operator issue (see .github/ISSUE_TEMPLATE/operator.yml) with your public key (validators), public IP, and peer id."
