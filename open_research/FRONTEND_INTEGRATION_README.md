# OpenResearch Solana Client Integration Guide

This README is for frontend/client engineers integrating with the OpenResearch Anchor program and migrating client logic from the previous EVM/PBM-style contracts to Solana.

Program id:

```text
ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
```

## 1. Public RPC URLs

Use public RPCs for development, demos, and low-volume testing only. Public endpoints are shared infrastructure and can return `429` rate-limit errors or `403` blocks under load.

Official Solana public endpoints:

```text
Localnet: http://127.0.0.1:8899
Devnet:   https://api.devnet.solana.com
Testnet:  https://api.testnet.solana.com
Mainnet:  https://api.mainnet-beta.solana.com
```

Source: Solana public RPC documentation:

- https://solana.com/docs/core/clusters
- https://solana.com/docs/rpc

Free/public third-party endpoints verified with `getHealth` on 2026-05-08:

```text
Mainnet: https://solana-rpc.publicnode.com
Mainnet: https://solana.rpc.subquery.network/public
Devnet:  https://solana-devnet.api.onfinality.io/public
```

Third-party endpoint directory checked:

- https://www.comparenodes.com/library/public-endpoints/solana/

Recommended frontend env vars:

```env
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID=ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
```

For production mainnet, use a private/dedicated RPC once traffic is real. The public endpoints are acceptable for initial integration and QA.

## 2. Frontend Dependencies

Install the Solana wallet adapter, Anchor client, and SPL Token helpers:

```sh
npm install @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @coral-xyz/anchor @solana/spl-token bn.js
```

For TypeScript:

```sh
npm install -D @types/bn.js
```

## 3. IDL Setup

Copy the bundled full IDL into the frontend:

```sh
cp idl/open_research.json ../frontend/src/idl/open_research.json
```

If you are testing a different program build, replace it with that build's generated IDL. The frontend needs the IDL to use `program.methods.*`.

Frontend import shape:

```ts
import idl from "@/idl/open_research.json";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
```

## 4. Provider and Program Client

```ts
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "@/idl/open_research.json";

export const OPEN_RESEARCH_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID!
);

export function getOpenResearchProgram(wallet: any) {
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL!,
    "confirmed"
  );

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  const idlWithAddress = {
    ...(idl as any),
    address: OPEN_RESEARCH_PROGRAM_ID.toBase58(),
  };

  return new Program(idlWithAddress, provider);
}
```

## 5. PDA Helpers

All IDs are little-endian `u64`.

```ts
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_OPEN_RESEARCH_PROGRAM_ID!);
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function u64Le(value: number | bigint) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

export const pdas = {
  config: () =>
    PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0],

  verifier: (verifier: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("verifier"), verifier.toBuffer()],
      PROGRAM_ID
    )[0],

  project: (projectId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("project"), u64Le(projectId)],
      PROGRAM_ID
    )[0],

  mint: (projectId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("mint"), u64Le(projectId)],
      PROGRAM_ID
    )[0],

  mintAuthority: (projectId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), u64Le(projectId)],
      PROGRAM_ID
    )[0],

  solVault: (projectId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault"), u64Le(projectId)],
      PROGRAM_ID
    )[0],

  projectPool: (projectId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), u64Le(projectId)],
      PROGRAM_ID
    )[0],

  proposal: (proposalId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("proposal"), u64Le(proposalId)],
      PROGRAM_ID
    )[0],

  proposalEscrow: (proposalId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("proposal_escrow"), u64Le(proposalId)],
      PROGRAM_ID
    )[0],

  claimable: (projectId: number | bigint, account: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), u64Le(projectId), account.toBuffer()],
      PROGRAM_ID
    )[0],

  tokenMetadata: (mint: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )[0],
};
```

## 6. Data Type Migration From EVM/PBM Client

Use this mapping when porting frontend code:

```text
EVM address                  -> Solana PublicKey
msg.sender                   -> connected wallet publicKey signer
bytes32 hex string           -> Uint8Array/Buffer of exactly 32 bytes
uint256 amount               -> BN in client, u64 on-chain where this program expects token/lamport values
int256 score                 -> BN or number if safely inside JS safe integer; on-chain i64
msg.value ETH                -> explicit lamports argument; program transfers SOL via System Program
ERC20 balance                -> SPL token account balance
ERC20 approve/allowance      -> usually not needed; owner signs transaction transferring from their token account
ERC20 token address          -> SPL mint public key
ERC20 holder balance mapping -> Associated Token Account for user + mint
Solidity events              -> Anchor logs/events from transaction logs
chainId                      -> RPC URL + cluster + program id
contract address             -> program id + PDA seeds
```

Hash helper:

```ts
export function hex32ToBytes(hex: string): number[] {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length !== 64) throw new Error("expected bytes32 hex");
  return Array.from(Buffer.from(normalized, "hex"));
}
```

Amount helper:

```ts
import { BN } from "@coral-xyz/anchor";

export const u64 = (value: number | bigint | string) => new BN(value.toString());
```

## 7. Token Accounts

Project tokens are normal SPL Token mints with:

```text
decimals = 0
mint authority = mintAuthority PDA
freeze authority = mintAuthority PDA
Metaplex metadata = created during createProject
```

User token account:

```ts
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export function userProjectTokenAccount(mint: PublicKey, owner: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, false, TOKEN_PROGRAM_ID);
}
```

The program creates the buyer ATA during `buy` via `init_if_needed`. For other flows, create the ATA in the frontend first if it may not exist.

## 8. Instruction Examples

### initialize

Run once after deployment.

```ts
await program.methods
  .initialize()
  .accounts({
    authority: wallet.publicKey,
    config: pdas.config(),
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### addVerifier

```ts
const verifier = new PublicKey("...");

await program.methods
  .addVerifier(verifier)
  .accounts({
    authority: wallet.publicKey,
    config: pdas.config(),
    verifierEntry: pdas.verifier(verifier),
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### createProject

```ts
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const config = await program.account.globalConfig.fetch(pdas.config());
const projectId = config.nextProjectId;
const projectIdNum = BigInt(projectId.toString());
const mint = pdas.mint(projectIdNum);

await program.methods
  .createProject({
    protocolHash: hex32ToBytes(protocolHash),
    repoSnapshotHash: hex32ToBytes(repoSnapshotHash),
    benchmarkHash: hex32ToBytes(benchmarkHash),
    baselineAggregateScore: new BN(baselineScore.toString()),
    baselineMetricsHash: hex32ToBytes(baselineMetricsHash),
    tokenName: "OpenResearch Project",
    tokenSymbol: "ORP",
    basePrice: u64(100_000),      // lamports per first token
    slope: u64(1_000),            // lamports added per supply unit
    minerPoolCap: u64(1_000_000), // max reward tokens minted to miners
  })
  .accounts({
    creator: wallet.publicKey,
    config: pdas.config(),
    project: pdas.project(projectIdNum),
    mint,
    mintAuthority: pdas.mintAuthority(projectIdNum),
    solVault: pdas.solVault(projectIdNum),
    projectPool: pdas.projectPool(projectIdNum),
    tokenMetadata: pdas.tokenMetadata(mint),
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    metadataProgram: TOKEN_METADATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

### buy

```ts
const projectId = 0n;
const mint = pdas.mint(projectId);
const buyerTokenAccount = userProjectTokenAccount(mint, wallet.publicKey);

await program.methods
  .buy(u64(projectId), u64(1_000_000))
  .accounts({
    buyer: wallet.publicKey,
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    solVault: pdas.solVault(projectId),
    buyerTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### sell

```ts
await program.methods
  .sell(u64(projectId), u64(10))
  .accounts({
    seller: wallet.publicKey,
    project: pdas.project(projectId),
    mint,
    solVault: pdas.solVault(projectId),
    sellerTokenAccount: userProjectTokenAccount(mint, wallet.publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### submit

```ts
const config = await program.account.globalConfig.fetch(pdas.config());
const proposalId = BigInt(config.nextProposalId.toString());

await program.methods
  .submit(
    u64(projectId),
    hex32ToBytes(codeHash),
    hex32ToBytes(benchmarkLogHash),
    new BN(claimedScore.toString()),
    u64(stake),
    rewardRecipientPublicKey
  )
  .accounts({
    miner: wallet.publicKey,
    config: pdas.config(),
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    proposal: pdas.proposal(proposalId),
    proposalEscrow: pdas.proposalEscrow(proposalId),
    minerTokenAccount: userProjectTokenAccount(mint, wallet.publicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

### claimReview

```ts
await program.methods
  .claimReview(u64(proposalId))
  .accounts({
    verifier: wallet.publicKey,
    verifierEntry: pdas.verifier(wallet.publicKey),
    proposal: pdas.proposal(proposalId),
  })
  .rpc();
```

### approve

```ts
await program.methods
  .approve(u64(proposalId), new BN(verifiedScore.toString()), hex32ToBytes(metricsHash))
  .accounts({
    verifier: wallet.publicKey,
    verifierEntry: pdas.verifier(wallet.publicKey),
    proposal: pdas.proposal(proposalId),
    project: pdas.project(projectId),
    mint,
    mintAuthority: pdas.mintAuthority(projectId),
    proposalEscrow: pdas.proposalEscrow(proposalId),
    minerTokenAccount: userProjectTokenAccount(mint, minerPublicKey),
    rewardRecipientTokenAccount: userProjectTokenAccount(mint, rewardRecipientPublicKey),
    tokenProgram: TOKEN_PROGRAM_ID,
  })
  .rpc();
```

### reject / expire / claimReward

Use the same PDA patterns:

```text
reject:
  verifier, verifierEntry, proposal, project, mint, mintAuthority,
  proposalEscrow, projectPool, claimable(verifier), tokenProgram, systemProgram

expire:
  cranker, proposal, project, mint, mintAuthority,
  proposalEscrow, projectPool, claimable(cranker), tokenProgram, systemProgram

claimReward:
  claimer, project, mint, mintAuthority, projectPool,
  claimable(claimer), claimerTokenAccount, tokenProgram
```

## 9. Read State

```ts
const config = await program.account.globalConfig.fetch(pdas.config());
const project = await program.account.project.fetch(pdas.project(0));
const proposal = await program.account.proposal.fetch(pdas.proposal(0));
```

Read token balances:

```ts
const ata = userProjectTokenAccount(project.mint, owner);
const balance = await connection.getTokenAccountBalance(ata);
```

## 10. Migration Checklist

1. Replace EVM contract addresses with `OPEN_RESEARCH_PROGRAM_ID` plus PDA helpers.
2. Replace all `address` strings with `PublicKey`.
3. Convert every `bytes32` value into exactly 32 bytes before sending.
4. Convert `uint256` amounts into Anchor `BN`; ensure values fit the program's `u64` fields.
5. Replace ERC20 approval flows with SPL token account ownership and wallet-signed transfers.
6. Use Associated Token Accounts for user balances.
7. Fetch `nextProjectId` / `nextProposalId` from `GlobalConfig` before deriving new PDAs.
8. Expect all writes to require wallet signatures and SOL rent/transaction fees.
9. Use `confirmed` commitment for normal UI state; use `finalized` for irreversible bookkeeping.
10. Treat public RPC as development infrastructure; add retry/backoff for `429`.

## 11. Deployment Dependency for Frontend

The frontend cannot fully execute live program calls until:

1. `target/deploy/open_research.so` is built.
2. The program is deployed to the selected cluster.
3. The deployed program id matches:

   ```text
   ACfzPQJkUJ74bdnmvV6FmB8Me3s1cPA3ayWjt2vHRsv3
   ```

4. The IDL is copied into the frontend.
5. `initialize` has been called once on that cluster.
