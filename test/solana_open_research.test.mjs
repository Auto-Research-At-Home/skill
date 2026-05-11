import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { buildPublishArtifactPaths } from "../autoresearch-create/scripts/publish_project_0g_lib.mjs";
import {
  applyIrysArtifactIds,
  applyIrysArtifactHashes,
  buildIrysBrowserUploadPlan,
  mergeIrysUploadReceipts,
  prepareIrysStorageArtifacts,
  resolveIrysNetwork,
} from "../autoresearch-create/scripts/irys_storage.mjs";
import { startLocalSolanaWalletPublish } from "../autoresearch-create/scripts/local_solana_wallet_publish.mjs";
import {
  OPEN_RESEARCH_PROGRAM_ID,
  approveProposalAccounts,
  bytes32ToIrysId,
  buyProjectTokenAccounts,
  claimReviewAccounts,
  claimRewardAccounts,
  costBetweenLamports,
  createAnchorWallet,
  createOpenResearchPdas,
  createProjectAccounts,
  createProjectInstructionArgs,
  expireProposalAccounts,
  hex32ToBytes,
  getOpenResearchProgram,
  i64Bn,
  irysIdToBytes32,
  publicKeyFrom,
  rejectProposalAccounts,
  releaseReviewAccounts,
  resolveSolanaConfig,
  stringifyPublicKeys,
  submitInstructionArgs,
  submitProposalAccounts,
  summarizeSolanaCreateProject,
  u64BigInt,
  u64Bn,
  u64Le,
  userProjectTokenAccount,
} from "../autoresearch-create/scripts/solana_open_research.mjs";

const OWNER_KEYPAIR = Keypair.fromSeed(
  Uint8Array.from(Array.from({ length: 32 }, (_v, i) => i + 1)),
);
const OWNER = OWNER_KEYPAIR.publicKey;
const REWARD = Keypair.fromSeed(
  Uint8Array.from(Array.from({ length: 32 }, (_v, i) => 100 + i)),
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

  const irysId = bytes32ToIrysId(Array(32).fill(7));
  assert.deepEqual(irysIdToBytes32(irysId), Array(32).fill(7));
  assert.deepEqual(irysIdToBytes32(`0x${"08".repeat(32)}`), Array(32).fill(8));
  assert.throws(() => irysIdToBytes32("not-an-id"), /Irys/);
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
    protocolIrysId: bytes32ToIrysId(Array(32).fill(11)),
    repoSnapshotHash: `0x${"02".repeat(32)}`,
    repoSnapshotIrysId: bytes32ToIrysId(Array(32).fill(12)),
    benchmarkHash: `0x${"03".repeat(32)}`,
    benchmarkIrysId: bytes32ToIrysId(Array(32).fill(13)),
    baselineAggregateScore: "-7",
    baselineMetricsHash: `0x${"04".repeat(32)}`,
    baselineMetricsIrysId: bytes32ToIrysId(Array(32).fill(14)),
    tokenName: "Research Token",
    tokenSymbol: "RCH",
    basePrice: "100",
    slope: "2",
    minerPoolCap: "1000000",
  };

  const args = createProjectInstructionArgs(inputs);
  assert.deepEqual(args.protocolHash, Array(32).fill(1));
  assert.deepEqual(args.protocolIrysId, Array(32).fill(11));
  assert.equal(args.baselineAggregateScore.toString(), "-7");
  assert.equal(args.basePrice.toString(), "100");

  const accounts = createProjectAccounts({ creator: OWNER, projectId: 42n });
  assert.equal(accounts.creator.toBase58(), OWNER.toBase58());
  assert.equal(accounts.mint.toBase58(), "DxnPHf7soRktjmYnwSj4AMvvz3z891yoFo9T2HzQAtDD");
});

test("builds buy accounts and quotes linear bonding curve cost", () => {
  const accounts = buyProjectTokenAccounts({ buyer: OWNER, projectId: 42n });
  assert.equal(accounts.buyer.toBase58(), OWNER.toBase58());
  assert.equal(accounts.mint.toBase58(), "DxnPHf7soRktjmYnwSj4AMvvz3z891yoFo9T2HzQAtDD");
  assert.equal(
    accounts.buyerTokenAccount.toBase58(),
    "DzWkKreQbb2kA6mEp2Zqyzm21eaMwm7hBpsw7bhQnA58",
  );
  assert.equal(costBetweenLamports(100n, 2n, 10n, 13n), 369n);
  assert.throws(() => costBetweenLamports(100n, 2n, 13n, 10n), /toSupply/);
});

test("builds submit proposal accounts without ERC20 allowance concepts", () => {
  const args = submitInstructionArgs({
    projectId: 42n,
    codeHash: `0x${"05".repeat(32)}`,
    codeIrysId: bytes32ToIrysId(Array(32).fill(15)),
    benchmarkLogHash: `0x${"06".repeat(32)}`,
    benchmarkLogIrysId: bytes32ToIrysId(Array(32).fill(16)),
    claimedAggregateScore: "11",
    stake: "3",
    rewardRecipient: REWARD,
  });
  assert.equal(args.projectId.toString(), "42");
  assert.deepEqual(args.codeHash, Array(32).fill(5));
  assert.deepEqual(args.codeIrysId, Array(32).fill(15));
  assert.equal(args.claimedAggregateScore.toString(), "11");
  assert.equal(args.stake.toString(), "3");
  assert.equal(args.rewardRecipient.toBase58(), REWARD.toBase58());

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

test("builds verifier settlement and reward account maps from the full IDL", () => {
  const claim = claimReviewAccounts({ verifier: OWNER, proposalId: 7n });
  assert.equal(claim.verifier.toBase58(), OWNER.toBase58());
  assert.equal(claim.proposal.toBase58(), "8qTMYLPsraSjNnjwoy3XCrksF8oPP6S4t17rWGB2gH38");

  const release = releaseReviewAccounts({ cranker: OWNER, proposalId: 7n });
  assert.equal(release.cranker.toBase58(), OWNER.toBase58());
  assert.equal(release.proposal.toBase58(), claim.proposal.toBase58());

  const approve = approveProposalAccounts({
    verifier: OWNER,
    projectId: 42n,
    proposalId: 7n,
    miner: OWNER,
    rewardRecipient: REWARD,
  });
  assert.equal(approve.proposalEscrow.toBase58(), "B1i1RNHkM3AQDaFRJvxTZwPSY8QX144iVMN5tTyVqeHM");
  assert.equal(
    approve.rewardRecipientTokenAccount.toBase58(),
    userProjectTokenAccount(approve.mint, REWARD).toBase58(),
  );

  const reject = rejectProposalAccounts({
    verifier: OWNER,
    projectId: 42n,
    proposalId: 7n,
  });
  assert.equal(reject.claimable.toBase58(), "2hhJS2fwpgXS6wtywb8Ce2w4YddFggjEzaQNxQnfU9U4");

  const expire = expireProposalAccounts({
    cranker: OWNER,
    projectId: 42n,
    proposalId: 7n,
  });
  assert.equal(expire.claimable.toBase58(), reject.claimable.toBase58());

  const reward = claimRewardAccounts({ claimer: OWNER, projectId: 42n });
  assert.equal(reward.claimerTokenAccount.toBase58(), "DzWkKreQbb2kA6mEp2Zqyzm21eaMwm7hBpsw7bhQnA58");
});

test("all skill Solana bundles use the root full IDL", () => {
  const root = JSON.parse(fs.readFileSync(path.resolve("idl/open_research.json"), "utf8"));
  const create = JSON.parse(
    fs.readFileSync(
      path.resolve("autoresearch-create/contracts/solana-open-research/open_research.json"),
      "utf8",
    ),
  );
  const mine = JSON.parse(
    fs.readFileSync(
      path.resolve("autoresearch-mine/contracts/solana-open-research/open_research.json"),
      "utf8",
    ),
  );
  const validate = JSON.parse(
    fs.readFileSync(
      path.resolve("autoresearch-validate/contracts/solana-open-research/open_research.json"),
      "utf8",
    ),
  );
  const instructionNames = new Set(root.instructions.map((ix) => ix.name));

  for (const required of [
    "create_project",
    "submit",
    "claim_review",
    "approve",
    "reject",
    "release_review",
    "expire",
    "claim_reward",
  ]) {
    assert.equal(instructionNames.has(required), true, `${required} missing`);
  }
  assert.deepEqual(create, root);
  assert.deepEqual(mine, root);
  assert.deepEqual(validate, root);
});

test("full IDL builds Anchor instructions for miner and verifier flows", async () => {
  const idl = JSON.parse(fs.readFileSync(path.resolve("idl/open_research.json"), "utf8"));
  const program = getOpenResearchProgram({
    wallet: createAnchorWallet(OWNER_KEYPAIR),
    idl,
    rpcUrl: "http://127.0.0.1:8899",
  });
  const submitArgs = submitInstructionArgs({
    projectId: 42n,
    codeHash: `0x${"05".repeat(32)}`,
    codeIrysId: bytes32ToIrysId(Array(32).fill(15)),
    benchmarkLogHash: `0x${"06".repeat(32)}`,
    benchmarkLogIrysId: bytes32ToIrysId(Array(32).fill(16)),
    claimedAggregateScore: "11",
    stake: "3",
    rewardRecipient: REWARD,
  });
  const submitIx = await program.methods
    .submit(
      submitArgs.projectId,
      submitArgs.codeHash,
      submitArgs.codeIrysId,
      submitArgs.benchmarkLogHash,
      submitArgs.benchmarkLogIrysId,
      submitArgs.claimedAggregateScore,
      submitArgs.stake,
      submitArgs.rewardRecipient,
    )
    .accounts(
      submitProposalAccounts({
        miner: OWNER,
        projectId: 42n,
        proposalId: 7n,
      }),
    )
    .instruction();
  assert.equal(submitIx.programId.toBase58(), OPEN_RESEARCH_PROGRAM_ID.toBase58());
  assert.equal(submitIx.keys.length, 11);

  const approveIx = await program.methods
    .approve(
      u64Bn(7n, "proposalId"),
      i64Bn("12", "verifiedAggregateScore"),
      hex32ToBytes(`0x${"07".repeat(32)}`, "metricsHash"),
      irysIdToBytes32(bytes32ToIrysId(Array(32).fill(17)), "metricsIrysId"),
    )
    .accounts(
      approveProposalAccounts({
        verifier: OWNER,
        projectId: 42n,
        proposalId: 7n,
        miner: OWNER,
        rewardRecipient: REWARD,
      }),
    )
    .instruction();
  assert.equal(approveIx.programId.toBase58(), OPEN_RESEARCH_PROGRAM_ID.toBase58());
  assert.equal(approveIx.keys.length, 10);

  const claimReviewIx = await program.methods
    .claimReview(u64Bn(7n, "proposalId"))
    .accounts(claimReviewAccounts({ verifier: OWNER, proposalId: 7n }))
    .instruction();
  assert.equal(claimReviewIx.keys.length, 3);

  const releaseReviewIx = await program.methods
    .releaseReview(u64Bn(7n, "proposalId"))
    .accounts(releaseReviewAccounts({ cranker: OWNER, proposalId: 7n }))
    .instruction();
  assert.equal(releaseReviewIx.keys.length, 2);

  const rejectIx = await program.methods
    .reject(
      u64Bn(7n, "proposalId"),
      hex32ToBytes(`0x${"08".repeat(32)}`, "metricsHash"),
      irysIdToBytes32(bytes32ToIrysId(Array(32).fill(18)), "metricsIrysId"),
    )
    .accounts(
      rejectProposalAccounts({
        verifier: OWNER,
        projectId: 42n,
        proposalId: 7n,
      }),
    )
    .instruction();
  assert.equal(rejectIx.keys.length, 11);

  const expireIx = await program.methods
    .expire(u64Bn(7n, "proposalId"))
    .accounts(
      expireProposalAccounts({
        cranker: OWNER,
        projectId: 42n,
        proposalId: 7n,
      }),
    )
    .instruction();
  assert.equal(expireIx.keys.length, 10);

  const claimRewardIx = await program.methods
    .claimReward(u64Bn(42n, "projectId"))
    .accounts(claimRewardAccounts({ claimer: OWNER, projectId: 42n }))
    .instruction();
  assert.equal(claimRewardIx.keys.length, 8);
});

test("summarizes Solana publish plan as JSON-safe strings", () => {
  const summary = summarizeSolanaCreateProject({
    creator: OWNER,
    projectId: 42n,
    config: resolveSolanaConfig({}, {}),
    inputs: {
      protocolHash: `0x${"01".repeat(32)}`,
      protocolIrysId: bytes32ToIrysId(Array(32).fill(11)),
      repoSnapshotHash: `0x${"02".repeat(32)}`,
      repoSnapshotIrysId: bytes32ToIrysId(Array(32).fill(12)),
      benchmarkHash: `0x${"03".repeat(32)}`,
      benchmarkIrysId: bytes32ToIrysId(Array(32).fill(13)),
      baselineAggregateScore: "7",
      baselineMetricsHash: `0x${"04".repeat(32)}`,
      baselineMetricsIrysId: bytes32ToIrysId(Array(32).fill(14)),
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

test("prepares Irys artifact hashes and upload metadata for Solana publishes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arah-irys-"));
  const protocolJson = path.join(dir, "protocol.json");
  const repo = path.join(dir, "repo.tar");
  const benchmark = path.join(dir, "benchmark.tar");
  const baseline = path.join(dir, "baseline.log");
  fs.writeFileSync(protocolJson, "{}\n");
  fs.writeFileSync(repo, "repo");
  fs.writeFileSync(benchmark, "bench");
  fs.writeFileSync(baseline, "metric=1");

  const network = resolveIrysNetwork({ cluster: "devnet" });
  const artifactPaths = buildPublishArtifactPaths({
    protocolJson,
    repoSnapshotFile: repo,
    benchmarkFile: benchmark,
    baselineMetricsFile: baseline,
  });
  const artifacts = prepareIrysStorageArtifacts({ artifactPaths, network });
  const options = applyIrysArtifactHashes({ protocolJson }, artifacts);
  const uploadPlan = buildIrysBrowserUploadPlan({
    storageArtifacts: artifacts,
    network,
  });

  assert.equal(network.name, "devnet");
  assert.match(options.protocolHash, /^0x[0-9a-f]{64}$/);
  assert.equal(options.protocolHash, artifacts.protocol.sha256Bytes32);
  assert.equal(uploadPlan.gatewayUrl, "https://devnet.irys.xyz");
  assert.equal(uploadPlan.artifacts.length, 4);
  assert.equal(uploadPlan.artifacts[0].fetchPath, "artifact/protocol");

  const uploaded = mergeIrysUploadReceipts({
    storageArtifacts: artifacts,
    network,
    uploadResult: {
      artifacts: {
        protocol: { id: "id-protocol" },
        repoSnapshot: { id: "id-repo" },
        benchmark: { id: "id-benchmark" },
        baselineMetrics: { id: "id-baseline" },
      },
    },
  });

  assert.equal(uploaded.protocol.irys.uploaded, true);
  assert.equal(uploaded.protocol.irys.gatewayUri, "https://devnet.irys.xyz/id-protocol");
  assert.deepEqual(applyIrysArtifactIds({}, uploaded), {
    protocolIrysId: "id-protocol",
    repoSnapshotIrysId: "id-repo",
    benchmarkIrysId: "id-benchmark",
    baselineMetricsIrysId: "id-baseline",
  });
});

test("Solana wallet page renders a local connect step before remote SDK imports", async () => {
  const session = await startLocalSolanaWalletPublish({
    cluster: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    programId: OPEN_RESEARCH_PROGRAM_ID.toBase58(),
    flow: "irys-register",
    open: false,
    timeoutMs: 30_000,
  });

  try {
    const html = await (await fetch(session.url)).text();
    assert.match(html, /const bootProgress =/);
    assert.match(html, /renderProgress\(bootProgress\)/);
    assert.match(html, /Connect your Solana wallet/);
    assert.match(html, /<script type="importmap">/);
    assert.match(html, /@noble\/curves@1\.9\.7\/esm\//);
    assert.match(html, /@noble\/hashes@1\.8\.0\/esm\//);
    assert.match(html, /irys-bundles-shim\.mjs/);
    assert.match(html, /node-crypto-shim\.mjs/);
    assert.match(html, /node-stream-shim\.mjs/);
    assert.match(html, /buffer@6\.0\.3\?bundle/);
    assert.match(html, /uuid@8\.3\.2\/dist\/esm-browser\//);
    assert.match(html, /@irys\/web-upload-solana@0\.1\.8\?bundle&deps=@irys\/bundles@0\.0\.5/);
    assert.equal(/import\\s*\\{[^}]*Connection[^}]*\\}\\s*from/.test(html), false);
    assert.equal(
      html.includes('import("https://esm.sh/@solana/web3.js'),
      true,
    );
  } finally {
    await session.close();
  }
});
