#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  bigintReplacer,
  buildCreateProjectInputs,
  buildPublishArtifactPaths,
  parseArgs,
  readJson,
} from "./publish_project_0g_lib.mjs";
import {
  applyIrysArtifactHashes,
  buildIrysBrowserUploadPlan,
  mergeIrysUploadReceipts,
  prepareIrysStorageArtifacts,
  resolveIrysNetwork,
} from "./irys_storage.mjs";
import {
  createAnchorWallet,
  createOpenResearchPdas,
  createProjectAccounts,
  createProjectInstructionArgs,
  getOpenResearchProgram,
  publicKeyFrom,
  readSolanaKeypair,
  resolveSolanaConfig,
  stringifyPublicKeys,
  summarizeSolanaCreateProject,
  u64BigInt,
} from "./solana_open_research.mjs";
import { startLocalSolanaWalletPublish } from "./local_solana_wallet_publish.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SOLANA_DEPLOYMENT = path.join(
  SKILL_DIR,
  "contracts",
  "solana-open-research",
  "deployment.json",
);

function resolveBundledIdlPath() {
  try {
    const deployment = readJson(DEFAULT_SOLANA_DEPLOYMENT);
    const idlField = deployment?.programs?.OpenResearch?.idl;
    if (!idlField) return null;
    return path.resolve(path.dirname(DEFAULT_SOLANA_DEPLOYMENT), idlField);
  } catch {
    return null;
  }
}

function usage() {
  console.log(`Usage:
  node scripts/publish_project_solana.mjs \\
    --protocol-json ./out/protocol.json \\
    --repo-snapshot-file ./repo-snapshot.tar \\
    --benchmark-file ./benchmark.tar \\
    --baseline-metrics-file ./out/baseline_run.log \\
    --baseline-aggregate-score 12345 \\
    --token-name "My Research Token" \\
    --token-symbol MRT \\
    --base-price 100000 \\
    --slope 1000 \\
    --miner-pool-cap 21000000 \\
    --upload-artifacts-to-irys \\
    --yes

Bootstrap (one-time after a fresh program deployment):
  node scripts/publish_project_solana.mjs --initialize-only --yes

Default live submit:
  Opens a localhost browser page; pick your Solana wallet extension
  (Phantom, Solflare, Backpack, or any Wallet Standard wallet) and
  approve the createProject transaction. No private key on disk.

Filesystem keypair fallback:
  add --keypair ~/.config/solana/id.json to sign without a browser.

Notes:
  - Bundled full Anchor IDL is at contracts/solana-open-research/open_research.json.
    Override with --idl only when testing another build.
  - Irys is the default artifact layer for Solana. On devnet/testnet it uses
    Irys devnet; on mainnet-beta it uses Irys mainnet. Override with
    --irys-network devnet|mainnet.
  - The four on-chain hash fields are SHA-256 of the raw artifact bytes.
    Irys transaction ids and gateway URLs are recorded in storage_irys.json.
  - Pass --allow-skip-storage only if you intentionally want to publish hashes
    without uploading the files to Irys.
  - Pass --initialize-only to bootstrap the OpenResearch GlobalConfig PDA on a
    fresh program deployment. Opens the same browser wallet flow and submits
    the initialize instruction instead of createProject. Skips protocol/
    artifact preparation. Requires the authority wallet that deployed the
    program.
  - --dry-run defaults --project-id to 0 if not supplied.
  - RPC defaults to devnet. Override with --cluster, --rpc-url, or env vars:
    NEXT_PUBLIC_SOLANA_CLUSTER, NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID.
`);
}

async function runInitializeOnly({ options, live, useBrowserWallet, idlPath }) {
  if (!live) {
    throw new Error("--initialize-only does not support --dry-run; the bootstrap step is live-only");
  }
  if (options.uploadArtifactsToIrys || options.uploadArtifactsTo0g) {
    console.warn("[warning] artifact upload flags are ignored with --initialize-only");
  }

  const solanaConfig = resolveSolanaConfig(options);
  const pdas = createOpenResearchPdas(solanaConfig.programId);
  const configPda = pdas.config();
  const connection = new Connection(solanaConfig.rpcUrl, "confirmed");
  const existing = await connection.getAccountInfo(configPda, "confirmed");
  if (existing) {
    console.log(
      `OpenResearch GlobalConfig already initialized at ${configPda.toBase58()} on ${solanaConfig.cluster}. Nothing to do.`,
    );
    return 0;
  }

  const outputDir = path.resolve(
    options.outputDir ||
      (options.protocolJson ? path.dirname(path.resolve(options.protocolJson)) : process.cwd()),
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const keypair = options.keypair
    ? Keypair.fromSecretKey(readSolanaKeypair(path.resolve(options.keypair)))
    : null;

  let walletSession = null;
  if (useBrowserWallet) {
    walletSession = await startLocalSolanaWalletPublish({
      cluster: solanaConfig.cluster,
      rpcUrl: solanaConfig.rpcUrl,
      programId: solanaConfig.programId.toBase58(),
      flow: "register-only",
      open: !options.noOpen,
    });
    console.log(
      "\nOpen this local wallet signing page in a browser with the program authority's Solana wallet:\n",
    );
    console.log(walletSession.url);
    console.log(
      "\nConnect your wallet there to approve the OpenResearch initialize transaction.\n",
    );
  }

  let authority;
  if (useBrowserWallet) {
    console.log("Waiting for wallet connection in the browser…");
    const connected = await walletSession.waitForAccount();
    authority = new PublicKey(connected);
    console.log(`Connected wallet: ${authority.toBase58()}`);
  } else {
    authority = options.creator
      ? publicKeyFrom(options.creator, "creator")
      : keypair?.publicKey;
    if (!authority) {
      throw new Error("--creator is required when --keypair is not supplied");
    }
  }

  const idl = readJson(idlPath);
  const wallet = keypair
    ? createAnchorWallet(keypair)
    : readonlyAnchorWallet(authority);
  const program = getOpenResearchProgram({
    wallet,
    idl,
    rpcUrl: solanaConfig.rpcUrl,
    programId: solanaConfig.programId,
  });

  const summary = stringifyPublicKeys({
    network: solanaConfig.cluster,
    rpcUrl: solanaConfig.rpcUrl,
    programId: solanaConfig.programId,
    method: "open_research.initialize",
    authority,
    accounts: {
      authority,
      config: configPda,
      systemProgram: SystemProgram.programId,
    },
  });
  console.log("\nSolana OpenResearch initialize plan\n");
  console.log(JSON.stringify(summary, bigintReplacer, 2));
  walletSession?.setSummary(summary);

  let signature;
  if (useBrowserWallet) {
    walletSession.setStepStatus("register", "active");
    const instruction = await program.methods
      .initialize()
      .accounts({
        authority,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    walletSession.setInstructionPlan({
      programId: instruction.programId.toBase58(),
      keys: instruction.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: !!k.isSigner,
        isWritable: !!k.isWritable,
      })),
      data: Buffer.from(instruction.data).toString("base64"),
    });

    console.log("\nWaiting for browser wallet approval and signature…\n");
    const result = await walletSession.result;
    signature = result.signature;
    console.log(`Solana transaction signature: ${signature}`);

    console.log("Confirming transaction…");
    const status = await program.provider.connection.confirmTransaction(
      signature,
      "confirmed",
    );
    if (status.value.err) {
      const message = `transaction failed: ${JSON.stringify(status.value.err)}`;
      walletSession.setStepStatus("register", "error", message);
      throw new Error(message);
    }
  } else {
    signature = await program.methods
      .initialize()
      .accounts({
        authority,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  const record = {
    cluster: solanaConfig.cluster,
    rpcUrl: solanaConfig.rpcUrl,
    programId: solanaConfig.programId.toBase58(),
    signature,
    instruction: "initialize",
    authority: authority.toBase58(),
    accounts: stringifyPublicKeys({
      authority,
      config: configPda,
      systemProgram: SystemProgram.programId,
    }),
    signedBy: keypair ? "keypair" : "browserWallet",
  };
  const recordPath = path.join(outputDir, "initialize_solana.json");
  fs.writeFileSync(recordPath, JSON.stringify(record, bigintReplacer, 2) + "\n");
  console.log(`Initialize record written: ${recordPath}`);
  console.log(`Solana transaction signature: ${signature}`);

  walletSession?.setComplete({
    signature,
    cluster: solanaConfig.cluster,
    title: "Program initialized",
    description:
      "GlobalConfig is now live on Solana. You can return to the CLI and run the project publish.",
  });
  await walletSession?.close({ delayMs: 5000 });
  return 0;
}

async function assertGlobalConfigExists(solanaConfig) {
  const pdas = createOpenResearchPdas(solanaConfig.programId);
  const configPda = pdas.config();
  const connection = new Connection(solanaConfig.rpcUrl, "confirmed");
  let info;
  try {
    info = await connection.getAccountInfo(configPda, "confirmed");
  } catch (err) {
    throw new Error(
      `failed to read OpenResearch GlobalConfig at ${configPda.toBase58()} on ${solanaConfig.cluster}: ${err.message}`,
    );
  }
  if (info) return;
  throw new Error(
    [
      `OpenResearch GlobalConfig PDA ${configPda.toBase58()} does not exist on ${solanaConfig.cluster}.`,
      `The program at ${solanaConfig.programId.toBase58()} has not been initialized yet.`,
      "",
      "Bootstrap it once with the program's authority wallet:",
      "  node scripts/publish_project_solana.mjs --initialize-only --yes",
      "",
      "Then re-run this command to register the project.",
    ].join("\n"),
  );
}

function readonlyAnchorWallet(publicKey) {
  return {
    publicKey: publicKeyFrom(publicKey, "creator"),
    signTransaction: async () => {
      throw new Error("read-only wallet cannot sign");
    },
    signAllTransactions: async () => {
      throw new Error("read-only wallet cannot sign");
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return 0;
  }

  const live = !options.dryRun;
  if (live && !options.yes) {
    throw new Error("refusing to submit Solana transaction without --yes");
  }
  if (options.uploadArtifactsTo0g) {
    console.warn(
      "[warning] --upload-artifacts-to-0g is deprecated for Solana publishes; using Irys instead.",
    );
  }
  const useBrowserWallet = live && !options.keypair;
  const idlPath = options.idl
    ? path.resolve(options.idl)
    : resolveBundledIdlPath();
  if (live && !idlPath) {
    throw new Error(
      "no Anchor IDL available: pass --idl, or restore the bundled IDL at contracts/solana-open-research/open_research.json",
    );
  }
  if (live && idlPath && !fs.existsSync(idlPath)) {
    throw new Error(`Anchor IDL not found at ${idlPath}`);
  }

  if (options.initializeOnly) {
    return runInitializeOnly({ options, live, useBrowserWallet, idlPath });
  }
  if (!live && !options.projectId && options.projectId !== 0) {
    options.projectId = "0";
    console.log(
      "[dry-run] no --project-id supplied; defaulting to 0 for the publish plan",
    );
  }

  const outputDir = path.resolve(
    options.outputDir || path.dirname(path.resolve(options.protocolJson)),
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const solanaConfig = resolveSolanaConfig(options);
  if (live) {
    await assertGlobalConfigExists(solanaConfig);
  }
  const irysNetwork = resolveIrysNetwork({
    cluster: solanaConfig.cluster,
    irysNetwork: options.irysNetwork,
  });
  const useIrysStorage =
    !options.allowSkipStorage &&
    (live || options.uploadArtifactsToIrys || options.uploadArtifactsTo0g);
  if (live && options.keypair && useIrysStorage) {
    throw new Error(
      "live Irys uploads require the browser wallet flow. Omit --keypair, or pass --allow-skip-storage if you intentionally want no artifact upload.",
    );
  }

  let storageArtifacts = null;
  let inputOptions = options;
  let irysUploadPlan = null;
  if (useIrysStorage) {
    const artifactPaths = buildPublishArtifactPaths(options);
    storageArtifacts = prepareIrysStorageArtifacts({
      artifactPaths,
      network: irysNetwork,
    });
    irysUploadPlan = buildIrysBrowserUploadPlan({
      storageArtifacts,
      network: irysNetwork,
    });
    inputOptions = applyIrysArtifactHashes(options, storageArtifacts);
    if (!live) {
      writeIrysStorageManifest({
        outputDir,
        network: irysNetwork,
        storageArtifacts,
        uploaded: false,
      });
    }
  }

  let walletSession = null;
  if (useBrowserWallet) {
    walletSession = await startLocalSolanaWalletPublish({
      cluster: solanaConfig.cluster,
      rpcUrl: solanaConfig.rpcUrl,
      programId: solanaConfig.programId.toBase58(),
      storageArtifacts,
      irysUploadPlan,
      artifactFiles: storageArtifacts,
      flow: useIrysStorage ? "irys-register" : "register-only",
      open: !options.noOpen,
    });
    console.log(
      "\nOpen this local wallet signing page in a browser with your Solana wallet extension:\n",
    );
    console.log(walletSession.url);
    console.log(
      useIrysStorage
        ? "\nConnect your wallet there to upload artifacts to Irys and approve the createProject transaction.\n"
        : "\nConnect your wallet there to approve the createProject transaction.\n",
    );
  }

  const inputs = buildCreateProjectInputs(inputOptions);
  const keypair = options.keypair
    ? Keypair.fromSecretKey(readSolanaKeypair(path.resolve(options.keypair)))
    : null;

  let creator;
  if (useBrowserWallet) {
    console.log("Waiting for wallet connection in the browser…");
    const connected = await walletSession.waitForAccount();
    creator = new PublicKey(connected);
    if (options.creator && String(options.creator) !== creator.toBase58()) {
      throw new Error(
        `--creator ${options.creator} does not match the connected wallet ${creator.toBase58()}`,
      );
    }
    console.log(`Connected wallet: ${creator.toBase58()}`);
  } else {
    creator = options.creator
      ? publicKeyFrom(options.creator, "creator")
      : keypair?.publicKey;
    if (!creator) {
      throw new Error("--creator is required when --keypair is not supplied");
    }
    if (
      keypair &&
      options.creator &&
      keypair.publicKey.toBase58() !== String(options.creator)
    ) {
      throw new Error("--creator does not match --keypair public key");
    }
  }

  let projectId = options.projectId ? u64BigInt(options.projectId, "project id") : null;
  let program = null;
  if (live) {
    const idl = readJson(idlPath);
    const wallet = keypair
      ? createAnchorWallet(keypair)
      : readonlyAnchorWallet(creator);
    program = getOpenResearchProgram({
      wallet,
      idl,
      rpcUrl: solanaConfig.rpcUrl,
      programId: solanaConfig.programId,
    });
    if (projectId === null) {
      const pdas = createOpenResearchPdas(solanaConfig.programId);
      const config = await program.account.globalConfig.fetch(pdas.config());
      projectId = u64BigInt(config.nextProjectId.toString(), "nextProjectId");
    }
  }

  const summary = summarizeSolanaCreateProject({
    inputs,
    creator,
    projectId,
    config: solanaConfig,
  });
  console.log("\nSolana OpenResearch publish plan\n");
  console.log(JSON.stringify(summary, bigintReplacer, 2));
  if (storageArtifacts) {
    console.log("\nIrys storage artifacts\n");
    console.log(JSON.stringify(storageArtifacts, bigintReplacer, 2));
  }
  walletSession?.setSummary(summary);

  if (!live) {
    const planPath = path.join(outputDir, "publish_solana_plan.json");
    fs.writeFileSync(
      planPath,
      JSON.stringify({ solana: summary, storageArtifacts, irysUploadPlan }, bigintReplacer, 2) + "\n",
    );
    console.log(`Solana publish plan written: ${planPath}`);
    return 0;
  }

  let signature;
  if (useBrowserWallet) {
    if (useIrysStorage) {
      console.log("\nWaiting for browser Irys uploads…\n");
      const irysResult = await walletSession.waitForIrysUploads();
      storageArtifacts = mergeIrysUploadReceipts({
        storageArtifacts,
        uploadResult: irysResult,
        network: irysNetwork,
      });
      writeIrysStorageManifest({
        outputDir,
        network: irysNetwork,
        storageArtifacts,
        uploaded: true,
      });
      walletSession.setStorageArtifacts(storageArtifacts);
    }
    walletSession.setStepStatus("register", "active");
    const instruction = await program.methods
      .createProject(createProjectInstructionArgs(inputs))
      .accounts(
        createProjectAccounts({
          creator,
          projectId,
          programId: solanaConfig.programId,
        }),
      )
      .instruction();
    walletSession.setInstructionPlan({
      programId: instruction.programId.toBase58(),
      keys: instruction.keys.map((k) => ({
        pubkey: k.pubkey.toBase58(),
        isSigner: !!k.isSigner,
        isWritable: !!k.isWritable,
      })),
      data: Buffer.from(instruction.data).toString("base64"),
    });

    console.log("\nWaiting for browser wallet approval and signature…\n");
    const result = await walletSession.result;
    signature = result.signature;
    console.log(`Solana transaction signature: ${signature}`);

    console.log("Confirming transaction…");
    const status = await program.provider.connection.confirmTransaction(
      signature,
      "confirmed",
    );
    if (status.value.err) {
      const message = `transaction failed: ${JSON.stringify(status.value.err)}`;
      walletSession.setStepStatus("register", "error", message);
      throw new Error(message);
    }
  } else {
    signature = await program.methods
      .createProject(createProjectInstructionArgs(inputs))
      .accounts(
        createProjectAccounts({
          creator,
          projectId,
          programId: solanaConfig.programId,
        }),
      )
      .rpc();
  }

  const record = {
    cluster: solanaConfig.cluster,
    rpcUrl: solanaConfig.rpcUrl,
    programId: solanaConfig.programId.toBase58(),
    signature,
    projectId: projectId.toString(),
    creator: creator.toBase58(),
    accounts: summary.accounts,
    args: stringifyPublicKeys(summary.args),
    storageArtifacts,
    signedBy: keypair ? "keypair" : "browserWallet",
    storageLayer: storageArtifacts ? "Irys" : "none",
  };
  const recordPath = path.join(outputDir, "publish_solana.json");
  fs.writeFileSync(recordPath, JSON.stringify(record, bigintReplacer, 2) + "\n");
  console.log(`Publish record written: ${recordPath}`);
  console.log(`Solana transaction signature: ${signature}`);

  walletSession?.setComplete({
    signature,
    projectId: projectId.toString(),
    cluster: solanaConfig.cluster,
  });
  await walletSession?.close({ delayMs: 5000 });
  return 0;
}

function writeIrysStorageManifest({ outputDir, network, storageArtifacts, uploaded }) {
  const manifest = {
    storageNetwork: "Irys",
    irysNetwork: network.name,
    gatewayUrl: network.gatewayUrl,
    permanence: network.permanence,
    uploaded,
    artifacts: storageArtifacts,
    note: "Solana project hash fields use sha256Bytes32 values computed from the raw artifact bytes. Irys ids and gateway URIs are retrieval metadata.",
  };
  const manifestPath = path.join(outputDir, "storage_irys.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, bigintReplacer, 2) + "\n");
  console.log(`Irys storage manifest written: ${manifestPath}`);
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`publish failed: ${err.message}`);
    process.exit(1);
  },
);
