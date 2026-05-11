import fs from "node:fs";
import anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

const { AnchorProvider, BN, Program } = anchor;

export const OPEN_RESEARCH_PROGRAM_ID = new PublicKey(
  "ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3",
);
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
export const SOLANA_PUBLIC_RPC_URLS = Object.freeze({
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
});

const BYTES32_RE = /^(?:0x)?[0-9a-fA-F]{64}$/;
const U64_MAX = (1n << 64n) - 1n;
export const ZERO_IRYS_ID = `0x${"00".repeat(32)}`;

export function resolveSolanaConfig(options = {}, env = process.env) {
  const cluster =
    options.cluster || env.NEXT_PUBLIC_SOLANA_CLUSTER || env.SOLANA_CLUSTER || "devnet";
  const rpcUrl =
    options.rpcUrl ||
    env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    env.SOLANA_RPC_URL ||
    SOLANA_PUBLIC_RPC_URLS[cluster] ||
    clusterApiUrl(cluster);
  const programId = publicKeyFrom(
    options.programId ||
      env.NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID ||
      env.OPEN_RESEARCH_PROGRAM_ID ||
      OPEN_RESEARCH_PROGRAM_ID,
    "OpenResearch program id",
  );

  return { cluster, rpcUrl, programId };
}

export function publicKeyFrom(value, label = "public key") {
  try {
    return value instanceof PublicKey ? value : new PublicKey(String(value));
  } catch (error) {
    throw new Error(`${label} must be a valid Solana public key`);
  }
}

export function u64BigInt(value, label = "u64 value") {
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`${label} must be an unsigned integer`);
  }
  const n = BigInt(text);
  if (n > U64_MAX) {
    throw new Error(`${label} exceeds u64 max`);
  }
  return n;
}

export function u64Le(value, label = "u64 value") {
  const n = u64BigInt(value, label);
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(n);
  return out;
}

export function u64Bn(value, label = "u64 value") {
  return new BN(u64BigInt(value, label).toString());
}

export function i64Bn(value, label = "i64 value") {
  const text = String(value);
  if (!/^-?[0-9]+$/.test(text)) {
    throw new Error(`${label} must be an integer`);
  }
  const n = BigInt(text);
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min || n > max) {
    throw new Error(`${label} exceeds i64 range`);
  }
  return new BN(text);
}

export function hex32ToBytes(hex, label = "bytes32") {
  const text = String(hex);
  if (!BYTES32_RE.test(text)) {
    throw new Error(`${label} must be a 0x-prefixed bytes32 hex string`);
  }
  const normalized = text.startsWith("0x") ? text.slice(2) : text;
  return Array.from(Buffer.from(normalized, "hex"));
}

export function bytes32ToHex(value, label = "bytes32") {
  const bytes = bytes32FromArray(value, label);
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export function bytes32FromArray(value, label = "bytes32") {
  if (!Array.isArray(value) && !(value instanceof Uint8Array) && !Buffer.isBuffer(value)) {
    throw new Error(`${label} must be a byte array`);
  }
  if (value.length !== 32) {
    throw new Error(`${label} must contain exactly 32 bytes`);
  }
  return Array.from(value);
}

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BS58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

function bs58Decode(text) {
  let zeroes = 0;
  while (zeroes < text.length && text[zeroes] === "1") zeroes++;
  const size = Math.floor((text.length - zeroes) * 733) / 1000 + 1 | 0;
  const b256 = new Uint8Array(size);
  let length = 0;
  for (let i = zeroes; i < text.length; i++) {
    const carryStart = BS58_ALPHABET.indexOf(text[i]);
    if (carryStart < 0) return null;
    let carry = carryStart;
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 58 * b256[k];
      b256[k] = carry & 0xff;
      carry >>= 8;
    }
    length = j;
  }
  let it = size - length;
  while (it < size && b256[it] === 0) it++;
  const out = new Uint8Array(zeroes + (size - it));
  let k = zeroes;
  for (; it < size; it++) out[k++] = b256[it];
  return out;
}

function tryBase64UrlDecode32(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = Buffer.from(padded, "base64");
  return decoded.length === 32 ? Array.from(decoded) : null;
}

function tryBase58Decode32(text) {
  if (!BS58_RE.test(text)) return null;
  const decoded = bs58Decode(text);
  return decoded && decoded.length === 32 ? Array.from(decoded) : null;
}

export function irysIdToBytes32(value, label = "Irys id") {
  if (Array.isArray(value) || value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return bytes32FromArray(value, label);
  }

  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  if (BYTES32_RE.test(text)) {
    return hex32ToBytes(text, label);
  }

  // base64url of 32 bytes is 43 chars (no padding); base58 of 32 bytes is
  // almost always 44 chars. Prefer base64url for 43-char inputs (canonical
  // Arweave/gateway format and what bytes32ToIrysId emits) and base58 for
  // 44-char inputs (what @irys/web-upload-solana returns for Solana receipts).
  // Strings containing `-` or `_` are unambiguously base64url.
  const hasBase64UrlOnlyChars = /[-_]/.test(text);
  const preferBase64 = hasBase64UrlOnlyChars || text.length === 43;
  const first = preferBase64 ? tryBase64UrlDecode32 : tryBase58Decode32;
  const second = preferBase64 ? tryBase58Decode32 : tryBase64UrlDecode32;
  const decoded = first(text) || second(text);
  if (!decoded) {
    throw new Error(`${label} must be a 32-byte Irys/Arweave transaction id`);
  }
  return decoded;
}

export function bytes32ToIrysId(value, label = "Irys id") {
  const bytes = bytes32FromArray(value, label);
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createOpenResearchPdas(programId = OPEN_RESEARCH_PROGRAM_ID) {
  const id = publicKeyFrom(programId, "program id");
  const find = (seeds) => PublicKey.findProgramAddressSync(seeds, id)[0];

  return {
    config: () => find([Buffer.from("config")]),
    verifier: (verifier) =>
      find(
        [Buffer.from("verifier"), publicKeyFrom(verifier, "verifier").toBuffer()],
      ),
    project: (projectId) =>
      find([Buffer.from("project"), u64Le(projectId, "project id")]),
    mint: (projectId) =>
      find([Buffer.from("mint"), u64Le(projectId, "project id")]),
    mintAuthority: (projectId) =>
      find(
        [Buffer.from("mint_authority"), u64Le(projectId, "project id")],
      ),
    solVault: (projectId) =>
      find([Buffer.from("sol_vault"), u64Le(projectId, "project id")]),
    projectPool: (projectId) =>
      find([Buffer.from("pool"), u64Le(projectId, "project id")]),
    proposal: (proposalId) =>
      find(
        [Buffer.from("proposal"), u64Le(proposalId, "proposal id")],
      ),
    proposalEscrow: (proposalId) =>
      find(
        [Buffer.from("proposal_escrow"), u64Le(proposalId, "proposal id")],
      ),
    claimable: (projectId, account) =>
      find(
        [
          Buffer.from("claim"),
          u64Le(projectId, "project id"),
          publicKeyFrom(account, "account").toBuffer(),
        ],
      ),
    tokenMetadata: (mint) =>
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          publicKeyFrom(mint, "mint").toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID,
      )[0],
  };
}

export function userProjectTokenAccount(mint, owner) {
  return getAssociatedTokenAddressSync(
    publicKeyFrom(mint, "mint"),
    publicKeyFrom(owner, "owner"),
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

export function createAnchorWallet(keypair) {
  return {
    publicKey: keypair.publicKey,
    signTransaction: async (tx) => {
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async (txs) => {
      for (const tx of txs) {
        tx.partialSign(keypair);
      }
      return txs;
    },
  };
}

export function readSolanaKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Solana keypair must be a JSON byte array: ${filePath}`);
  }
  return Uint8Array.from(raw);
}

export function getOpenResearchProgram({
  wallet,
  idl,
  rpcUrl,
  programId = OPEN_RESEARCH_PROGRAM_ID,
  commitment = "confirmed",
}) {
  if (!wallet?.publicKey) {
    throw new Error("wallet with publicKey is required");
  }
  if (!idl) {
    throw new Error("Anchor IDL is required to build a Program client");
  }
  const connection = new Connection(rpcUrl || SOLANA_PUBLIC_RPC_URLS.devnet, {
    commitment,
  });
  const provider = new AnchorProvider(connection, wallet, {
    commitment,
    preflightCommitment: commitment,
  });
  const id = publicKeyFrom(programId, "program id");
  const idlWithAddress = { ...idl, address: id.toBase58() };
  return new Program(idlWithAddress, provider);
}

export function createProjectInstructionArgs(inputs) {
  return {
    protocolHash: hex32ToBytes(inputs.protocolHash, "protocolHash"),
    protocolIrysId: irysIdToBytes32(
      inputs.protocolIrysId || ZERO_IRYS_ID,
      "protocolIrysId",
    ),
    repoSnapshotHash: hex32ToBytes(inputs.repoSnapshotHash, "repoSnapshotHash"),
    repoSnapshotIrysId: irysIdToBytes32(
      inputs.repoSnapshotIrysId || ZERO_IRYS_ID,
      "repoSnapshotIrysId",
    ),
    benchmarkHash: hex32ToBytes(inputs.benchmarkHash, "benchmarkHash"),
    benchmarkIrysId: irysIdToBytes32(
      inputs.benchmarkIrysId || ZERO_IRYS_ID,
      "benchmarkIrysId",
    ),
    baselineAggregateScore: i64Bn(
      inputs.baselineAggregateScore,
      "baselineAggregateScore",
    ),
    baselineMetricsHash: hex32ToBytes(
      inputs.baselineMetricsHash,
      "baselineMetricsHash",
    ),
    baselineMetricsIrysId: irysIdToBytes32(
      inputs.baselineMetricsIrysId || ZERO_IRYS_ID,
      "baselineMetricsIrysId",
    ),
    tokenName: String(inputs.tokenName),
    tokenSymbol: String(inputs.tokenSymbol),
    basePrice: u64Bn(inputs.basePrice, "basePrice"),
    slope: u64Bn(inputs.slope, "slope"),
    minerPoolCap: u64Bn(inputs.minerPoolCap, "minerPoolCap"),
  };
}

export function createProjectAccounts({
  creator,
  projectId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const mint = pdas.mint(projectId);
  return {
    creator: publicKeyFrom(creator, "creator"),
    config: pdas.config(),
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    solVault: pdas.solVault(projectId),
    projectPool: pdas.projectPool(projectId),
    tokenMetadata: pdas.tokenMetadata(mint),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    metadataProgram: TOKEN_METADATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };
}

export function buyProjectTokenAccounts({
  buyer,
  projectId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const mint = pdas.mint(projectId);
  const buyerPk = publicKeyFrom(buyer, "buyer");
  return {
    buyer: buyerPk,
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    solVault: pdas.solVault(projectId),
    buyerTokenAccount: userProjectTokenAccount(mint, buyerPk),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}

export function costBetweenLamports(basePrice, slope, fromSupply, toSupply) {
  const base = BigInt(basePrice);
  const step = BigInt(slope);
  const from = BigInt(fromSupply);
  const to = BigInt(toSupply);
  if (to < from) {
    throw new Error("toSupply must be greater than or equal to fromSupply");
  }
  const amount = to - from;
  return base * amount + (step * amount * (2n * from + amount)) / 2n;
}

export function submitInstructionArgs(inputs) {
  return {
    projectId: u64Bn(inputs.projectId, "projectId"),
    codeHash: hex32ToBytes(inputs.codeHash, "codeHash"),
    codeIrysId: irysIdToBytes32(inputs.codeIrysId || ZERO_IRYS_ID, "codeIrysId"),
    benchmarkLogHash: hex32ToBytes(
      inputs.benchmarkLogHash,
      "benchmarkLogHash",
    ),
    benchmarkLogIrysId: irysIdToBytes32(
      inputs.benchmarkLogIrysId || ZERO_IRYS_ID,
      "benchmarkLogIrysId",
    ),
    claimedAggregateScore: i64Bn(
      inputs.claimedAggregateScore,
      "claimedAggregateScore",
    ),
    stake: u64Bn(inputs.stake, "stake"),
    rewardRecipient: publicKeyFrom(inputs.rewardRecipient, "rewardRecipient"),
  };
}

export function submitProposalAccounts({
  miner,
  projectId,
  proposalId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const mint = pdas.mint(projectId);
  const minerPk = publicKeyFrom(miner, "miner");
  return {
    miner: minerPk,
    config: pdas.config(),
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    proposal: pdas.proposal(proposalId),
    proposalEscrow: pdas.proposalEscrow(proposalId),
    minerTokenAccount: userProjectTokenAccount(mint, minerPk),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  };
}

export function claimReviewAccounts({
  verifier,
  proposalId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const verifierPk = publicKeyFrom(verifier, "verifier");
  return {
    verifier: verifierPk,
    verifierEntry: pdas.verifier(verifierPk),
    proposal: pdas.proposal(proposalId),
  };
}

export function releaseReviewAccounts({
  cranker,
  proposalId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  return {
    cranker: publicKeyFrom(cranker, "cranker"),
    proposal: pdas.proposal(proposalId),
  };
}

export function approveProposalAccounts({
  verifier,
  projectId,
  proposalId,
  miner,
  rewardRecipient,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const mint = pdas.mint(projectId);
  const verifierPk = publicKeyFrom(verifier, "verifier");
  return {
    verifier: verifierPk,
    verifierEntry: pdas.verifier(verifierPk),
    proposal: pdas.proposal(proposalId),
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    proposalEscrow: pdas.proposalEscrow(proposalId),
    minerTokenAccount: userProjectTokenAccount(mint, publicKeyFrom(miner, "miner")),
    rewardRecipientTokenAccount: userProjectTokenAccount(
      mint,
      publicKeyFrom(rewardRecipient, "rewardRecipient"),
    ),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

export function rejectProposalAccounts({
  verifier,
  projectId,
  proposalId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const verifierPk = publicKeyFrom(verifier, "verifier");
  return {
    verifier: verifierPk,
    verifierEntry: pdas.verifier(verifierPk),
    proposal: pdas.proposal(proposalId),
    project: pdas.project(projectId),
    mint: pdas.mint(projectId),
    mintAuthority: pdas.mintAuthority(projectId),
    proposalEscrow: pdas.proposalEscrow(proposalId),
    projectPool: pdas.projectPool(projectId),
    claimable: pdas.claimable(projectId, verifierPk),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}

export function expireProposalAccounts({
  cranker,
  projectId,
  proposalId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const crankerPk = publicKeyFrom(cranker, "cranker");
  return {
    cranker: crankerPk,
    proposal: pdas.proposal(proposalId),
    project: pdas.project(projectId),
    mint: pdas.mint(projectId),
    mintAuthority: pdas.mintAuthority(projectId),
    proposalEscrow: pdas.proposalEscrow(proposalId),
    projectPool: pdas.projectPool(projectId),
    claimable: pdas.claimable(projectId, crankerPk),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };
}

export function claimRewardAccounts({
  claimer,
  projectId,
  programId = OPEN_RESEARCH_PROGRAM_ID,
}) {
  const pdas = createOpenResearchPdas(programId);
  const claimerPk = publicKeyFrom(claimer, "claimer");
  const mint = pdas.mint(projectId);
  return {
    claimer: claimerPk,
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    projectPool: pdas.projectPool(projectId),
    claimable: pdas.claimable(projectId, claimerPk),
    claimerTokenAccount: userProjectTokenAccount(mint, claimerPk),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

export function stringifyPublicKeys(value) {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (value instanceof BN) {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => stringifyPublicKeys(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stringifyPublicKeys(item)]),
    );
  }
  return value;
}

export function summarizeSolanaCreateProject({
  inputs,
  creator,
  projectId,
  config = resolveSolanaConfig(),
}) {
  const accounts = createProjectAccounts({
    creator,
    projectId,
    programId: config.programId,
  });
  return stringifyPublicKeys({
    network: config.cluster,
    rpcUrl: config.rpcUrl,
    programId: config.programId,
    method: "open_research.createProject",
    projectId: u64BigInt(projectId, "project id").toString(),
    args: createProjectInstructionArgs(inputs),
    accounts,
  });
}
