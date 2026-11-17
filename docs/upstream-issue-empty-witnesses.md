# Upstream issue 88: fresh network commits block 1 with no shard witnesses

Filed as https://github.com/farcasterorg/hypersnap/issues/88 on 2026-11-17. Text as filed:

**Summary.** On a brand-new network (fc_network Testnet, 0.17.15, one validator at
genesis) every block from 1 onward is committed with an empty `shard_witness`
(`shardWitnessesHash` constant `rxNJufX5oaagQE3qNtzJSZvLJcmtwRK3zJqTyuQfMmI=`).
The lone validator never validates its own proposal, so the chain runs. When a
second validator is added by validator set change, it rejects every shard-0
proposal (`Received block with wrong number of shard witnesses: 0`) and the block
shard halts permanently at the change height. Data shards keep going.

**Where.** `src/consensus/proposer.rs`, `collect_confirmed_shard_witnesses`,
`DecoupleShardZeroBlockProduction` path:

1. Height 1: `desired_shard_block_number = 1`; the data shard stores have no chunk 1
   yet (all shards start together), `last_shard_witness` is `None` on a fresh chain,
   so nothing is inserted and the function returns `vec![]` with the warning
   "Block validator did not receive all shard chunks".
2. Height 2 and later: `get_last_shard_witness` reads block N-1, whose witness list is
   empty, finds no entry for the shard, logs "Unable to find last shard witness for
   block" and `continue`s. Empty again, forever.
3. With one validator the proposal is never checked against
   `witness.shard_chunk_witnesses.len() != self.num_shards`; with two it is.

**Repro.** Testnet compose, one key in `[[consensus.validator_sets]]` at
`effective_at = 0`, start from an empty `.rocks.testnet`. `HubService/GetBlocks`
for any height shows `"shardWitness": {}`. Append a second key at a future height,
start the second node: data shards continue, shard 0 stops at that height with the
three errors above every round.

**Expected.** Either block 1 waits for chunk 1 of every data shard (the pre-V8 path
polled with a timeout), or a validator validates its own proposal so an empty
witness list is never committed, or a block whose previous block has no witness
falls back to the data shard store's confirmed height instead of giving up.

**Workaround used.** Regenesis with two validators in the genesis set: round 0 of
block 1 fails validation on the peer, the next round finds the committed chunks.

Logs and block dumps available on request.
