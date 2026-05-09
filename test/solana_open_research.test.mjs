import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  OPEN_RESEARCH_PROGRAM_ID,
  createOpenResearchPdas,
  createProjectAccounts,
  createProjectInstructionArgs,
  hex32ToBytes,
  i64Bn,
  publicKeyFrom,
  resolveSolanaConfig,
  stringifyPublicKeys,
  submitProposalAccounts,
  summarizeSolanaCreateProject,
  u64BigInt,
  u64Bn,
  u64Le,
  userProjectTokenAccount,
} from "../autoresearch-create/scripts/solana_open_research.mjs";

const OWNER = Keypair.fromSeed(
  Uint8Array.from(Array.from({ length: 32 }, (_v, i) => i + 1)),
).publicKey;

test("resolves Solana config from env and validates program ids", () => {
  const config = resolveSolanaConfig(
    {},
    {
      NEXT_PUBLIC_SOLANA_CLUSTER: "devnet",
      NEXT_PUBLIC_SOLANA_RPC_URL: "https://example.invalid/rpc",
      NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID: OPEN_RESEARCH_PROGRAM_ID.toBase58(),
    },
  );

  assert.equal(config.cluster, "devnet");
  assert.equal(config.rpcUrl, "https://example.invalid/rpc");
  assert.equal(config.programId.toBase58(), OPEN_RESEARCH_PROGRAM_ID.toBase58());
  assert.throws(
    () => resolveSolanaConfig({ programId: "not-a-pubkey" }, {}),
    /program id/,
  );
});

test("converts bytes32 hashes into Anchor byte arrays", () => {
  assert.deepEqual(hex32ToBytes(`0x${"0a".repeat(32)}`), Array(32).fill(10));
  assert.deepEqual(hex32ToBytes(`${"ff".repeat(32)}`), Array(32).fill(255));
  assert.throws(() => hex32ToBytes("0x1234"), /bytes32/);
  assert.throws(() => hex32ToBytes(`0x${"gg".repeat(32)}`), /bytes32/);
});

test("validates u64 and i64 boundaries before PDA or Anchor conversion", () => {
  assert.equal(u64BigInt("18446744073709551615"), (1n << 64n) - 1n);
  assert.deepEqual([...u64Le(1)], [1, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(u64Bn("42").toString(), "42");
  assert.equal(i64Bn("-9223372036854775808").toString(), "-9223372036854775808");
  assert.equal(i64Bn("9223372036854775807").toString(), "9223372036854775807");
  assert.throws(() => u64BigInt("-1"), /unsigned/);
  assert.throws(() => u64BigInt("18446744073709551616"), /u64 max/);
  assert.throws(() => i64Bn("9223372036854775808"), /i64 range/);
});

test("derives OpenResearch PDAs with little-endian u64 seeds", () => {
  const pdas = createOpenResearchPdas();
  const mint = pdas.mint(42n);

  assert.equal(pdas.config().toBase58(), "2JpA9MUTcqBdiZGwPfQodgGMDKa3G4FaFwr66RSyJt5c");
  assert.equal(pdas.project(42n).toBase58(), "7kkee6PBLSdesdfrYT7PTrQjQMpF6PGkXx1mmTkbdxDU");
  assert.equal(mint.toBase58(), "DxnPHf7soRktjmYnwSj4AMvvz3z891yoFo9T2HzQAtDD");
  assert.equal(
    pdas.mintAuthority(42n).toBase58(),
    "5k7CQyAGg4s9a3orYhvH95QKNi2PaZLktTMNCzXKfBGx",
  );
  assert.equal(
    pdas.solVault(42n).toBase58(),
    "ApadtoNcpgpty6h9uv9dASEci6qgjhTnb7oZU5P9fHaD",
  );
  assert.equal(
    pdas.projectPool(42n).toBase58(),
    "6fzFbz28MVSTQ8vUBHZHt6eeU7NVFZoeJry4vitteXqe",
  );
  assert.equal(
    pdas.proposal(7n).toBase58(),
    "8qTMYLPsraSjNnjwoy3XCrksF8oPP6S4t17rWGB2gH38",
  );
  assert.equal(
    pdas.proposalEscrow(7n).toBase58(),
    "B1i1RNHkM3AQDaFRJvxTZwPSY8QX144iVMN5tTyVqeHM",
  );
  assert.equal(
    pdas.claimable(42n, OWNER).toBase58(),
    "2hhJS2fwpgXS6wtywb8Ce2w4YddFggjEzaQNxQnfU9U4",
  );
  assert.equal(
    pdas.tokenMetadata(mint).toBase58(),
    "6asn8BWFi41k76ot7kfdbDhmEnLRCUiL9YHW1H13vnEQ",
  );
});

test("derives associated token account for project SPL tokens", () => {
  const mint = createOpenResearchPdas().mint(42n);
  const ata = userProjectTokenAccount(mint, OWNER);
  assert.equal(ata.toBase58(), "DzWkKreQbb2kA6mEp2Zqyzm21eaMwm7hBpsw7bhQnA58");

  const offCurveOwner = new PublicKey("11111111111111111111111111111112");
  assert.throws(() => userProjectTokenAccount(mint, offCurveOwner), /OwnerOffCurve/);
});

test("builds createProject args and account maps for Anchor", () => {
  const inputs = {
    protocolHash: `0x${"01".repeat(32)}`,
    repoSnapshotHash: `0x${"02".repeat(32)}`,
    benchmarkHash: `0x${"03".repeat(32)}`,
    baselineAggregateScore: "-7",
    baselineMetricsHash: `0x${"04".repeat(32)}`,
    tokenName: "Research Token",
    tokenSymbol: "RCH",
    basePrice: "100",
    slope: "2",
    minerPoolCap: "1000000",
  };

  const args = createProjectInstructionArgs(inputs);
  assert.deepEqual(args.protocolHash, Array(32).fill(1));
  assert.equal(args.baselineAggregateScore.toString(), "-7");
  assert.equal(args.basePrice.toString(), "100");

  const accounts = createProjectAccounts({ creator: OWNER, projectId: 42n });
  assert.equal(accounts.creator.toBase58(), OWNER.toBase58());
  assert.equal(accounts.mint.toBase58(), "DxnPHf7soRktjmYnwSj4AMvvz3z891yoFo9T2HzQAtDD");
});

test("builds submit proposal accounts without ERC20 allowance concepts", () => {
  const accounts = submitProposalAccounts({
    miner: OWNER,
    projectId: 42n,
    proposalId: 7n,
  });

  assert.equal(accounts.miner.toBase58(), OWNER.toBase58());
  assert.equal(
    accounts.minerTokenAccount.toBase58(),
    "DzWkKreQbb2kA6mEp2Zqyzm21eaMwm7hBpsw7bhQnA58",
  );
});

test("summarizes Solana publish plan as JSON-safe strings", () => {
  const summary = summarizeSolanaCreateProject({
    creator: OWNER,
    projectId: 42n,
    config: resolveSolanaConfig({}, {}),
    inputs: {
      protocolHash: `0x${"01".repeat(32)}`,
      repoSnapshotHash: `0x${"02".repeat(32)}`,
      benchmarkHash: `0x${"03".repeat(32)}`,
      baselineAggregateScore: "7",
      baselineMetricsHash: `0x${"04".repeat(32)}`,
      tokenName: "Research Token",
      tokenSymbol: "RCH",
      basePrice: "100",
      slope: "2",
      minerPoolCap: "1000000",
    },
  });

  assert.equal(summary.network, "devnet");
  assert.equal(summary.programId, OPEN_RESEARCH_PROGRAM_ID.toBase58());
  assert.equal(summary.projectId, "42");
  assert.equal(summary.args.basePrice, "100");
  assert.equal(summary.accounts.creator, OWNER.toBase58());
  assert.deepEqual(stringifyPublicKeys({ key: publicKeyFrom(OWNER) }), {
    key: OWNER.toBase58(),
  });
});
