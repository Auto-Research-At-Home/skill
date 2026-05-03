# Auto Research At Home

> Decentralized, agent-driven scientific research — powered by competitive benchmarking, cryptographic attestation, and token incentives.

---

## The Vision

Science has always been limited by the number of researchers, the labs they work in, and the compute they can access. AutoResearch At Home breaks that constraint. It is a protocol that lets anyone — a developer, a GPU holder, a student with a laptop — contribute valid, benchmarked source code improvements to open research problems, earn tokens for doing so, and be trusted without having to be known.

The core insight: **if a benchmark can objectively measure the quality of code, then code improvement is a form of proof of work.** And if proof of work can be verified cheaply by a trusted execution environment, then you can build a fully decentralized, incentive-aligned research network on top of it.

This is what Auto Research At Home does.

---

## Inspiration

**Andrej Karpathy's [autoresearch](https://github.com/karpathy/autoresearch)** (March 2026) demonstrated that an AI coding agent, given a research direction and a benchmark, can autonomously run experiments in a tight loop — committing only the changes that beat the current best result, and discarding the rest. In two days of unsupervised runs, it discovered 20 key optimizations yielding an 11% training speedup. Shopify's CEO ran it overnight and got a 19% gain.

The insight was simple and profound: **the benchmark is the oracle**. The AI does not need to understand why a change is good — it just needs to measure it.

AutoResearch At Home takes this idea and asks: *what if instead of one agent on one machine, you had ten thousand agents on ten thousand machines, all competing to find the best improvement, with economic skin in the game?*

---

## Research Domains

AutoResearch At Home is not specific to ML. Any domain where a benchmark can objectively score code quality is a valid target.

**High-signal domains today:**
- **ML efficiency** — attention mechanisms, quantization, training loops, kernel fusion
- **Open source libraries** — numerical routines, parsing algorithms, compression codecs
- **Bioinformatics** — protein folding energy functions, sequence alignment algorithms
- **Blockchain** — consensus mechanism implementations, ZK proof generation speed
- **Compilers** — optimization passes, register allocation, instruction scheduling

**The unifying property:** there must be a deterministic, reproducible benchmark that can score a piece of code in bounded time on bounded hardware. If that exists, AutoResearch At Home can run on it.

---

## How It Works — The Big Picture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        RESEARCHER (Project Creator)                   │
│                                                                        │
│  1. Installs skills: npx skills add Auto-Research-At-Home/skill       │
│  2. Provides a GitHub repository URL                                  │
│  3. Agent reads + understands codebase, derives protocol.json         │
│  4. Agent runs repo in sandbox → establishes baseline benchmark score │
│  5. Researcher reviews protocol + baseline, approves or refines       │
│  6. ProjectRegistry creates a project token and publishes the project │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Published to IPFS + on-chain registry
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        PROTOCOL REGISTRY                              │
│  - Experiment protocol / Statement of Purpose (immutable)             │
│  - Benchmark suite (versioned, on-chain hash)                         │
│  - Current best code + score (mutable, updated on valid commits)      │
│  - Token contract (bonding curve)                                     │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Miners discover projects
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        MINER (Contributor Node)                       │
│                                                                        │
│  1. Picks a project to mine                                           │
│  2. AutoResearch loop runs locally (Karpathy-style):                 │
│     agent → edit code → run benchmark → beat current best? → commit  │
│  3. Stakes compute capital as bond                                     │
│  4. Submits proposal with stake, code hash, and benchmark proof       │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Proposal submitted with stake
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        VALIDATOR NETWORK (TEE Nodes)                  │
│                                                                        │
│  1. Reads submitted proposal + benchmark claim                        │
│  2. Re-runs benchmark inside Trusted Execution Environment            │
│  3. Cryptographically attests: result matches or does not match       │
│  4. If valid → miner earns project tokens + stake returned            │
│     If invalid → stake is slashed, redistributed to validators        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Architecture

### Layer 1 — Agent Skills Interface

Users interact with the system through a skill installed into their existing AI coding agent:

```bash
# Install all ARAH skills from this repository
npx skills add Auto-Research-At-Home/skill

# Or install only the project creation skill
npx skills add Auto-Research-At-Home/skill --skill autoresearch-create

# Or install only the mining skill (Phase 2 — trials against a finalized protocol)
npx skills add Auto-Research-At-Home/skill --skill autoresearch-mine
```

The skills are portable Agent Skills: each capability is a directory with a `SKILL.md` file plus any supporting resources. The `skills` CLI installs them into supported hosts such as Claude Code, Cursor, and Codex.

**Shipped today:** **`autoresearch-create`** helps researchers start from an existing GitHub repository, produce a versioned `protocol.json` plus `program.md`, run a baseline, then optionally publish an eligible project on-chain. **`autoresearch-mine`** runs the unattended mining loop on a finalized protocol and target checkout: bundled trial harness, `trials.jsonl`, optional GitHub PRs, and optional 0G **`ProjectRegistry`** frontier reads plus **`ProposalLedger.submit`** using contracts vendored under [`autoresearch-mine/contracts/`](autoresearch-mine/contracts/) (miners do not need `autoresearch-create` installed at runtime). Planned sibling skills cover status dashboards and validator-operator flows.

Skills handle the conversational, LLM-assisted workflow. Deterministic pieces already live in each skill’s scripts (baseline runs, mining loop helpers, on-chain sync/submit). Autonomous validator infrastructure and network-wide status surfaces are still future work.

---

### Layer 2 — Project Creation and the Experiment Protocol

A project starts with a real, existing GitHub repository — not a blank canvas or a description. The researcher provides a repo URL; the skill-assisted agent does the rest.

```
Researcher provides: "https://github.com/org/some-ml-library"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              REPO INGESTION (skill-assisted agent)              │
│                                                                  │
│  ① Clone + read codebase                                        │
│     - Understand structure, core algorithms, existing tests     │
│     - Identify what the library does and what it optimizes for  │
│                                                                  │
│  ② Derive experiment protocol / Statement of Purpose             │
│     - What problem does this code solve?                        │
│     - What are the natural axes of improvement?                 │
│       (speed, memory, accuracy, throughput, correctness)        │
│     - What inputs/outputs define correct behavior?              │
│                                                                  │
│  ③ Generate benchmark suite from the existing code              │
│     - Extract or write a harness that scores the current impl   │
│     - Define metrics: FLOPS, latency, perplexity, pass rate…   │
│     - Set hardware targets (A100, H100, consumer GPU, CPU)      │
│     - Define minimum threshold for a valid improvement          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              SANDBOX EXECUTION (baseline run)                   │
│                                                                  │
│  - Run the existing repo against the generated benchmark        │
│    inside an isolated Docker container                          │
│  - Record the score — this becomes the immutable baseline       │
│  - Verify the benchmark is deterministic across 3 runs          │
│  - Surface any environment dependencies for miners to replicate │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              Researcher reviews protocol + baseline score
              Refines wording, adjusts metric weights, approves
                              │
                              ▼
              protocol + baseline score hashed and recorded on-chain
              (immutable — benchmark spec and baseline cannot be
               changed without forking to a new project)
```

**Why an existing repo, not a blank prompt?**

Starting from a real codebase gives the protocol credibility — the benchmarks are grounded in code that actually runs, the baseline score is a real measurement not a guess, and miners know exactly what they are improving. It also means the project creator is putting something real on the table, not just an idea. The sandbox run is the moment of truth: if the repo does not run cleanly in isolation, the project creator must fix it before the project can be listed. This keeps the registry populated only with actionable research targets.

The immutability of the protocol is critical. It prevents the project creator from moving the goalposts after miners have invested compute. The benchmark is the contract.

---

### Layer 3 — The Token Engine

Each project mints its own token via `ProjectRegistry.createProject(...)`, which deploys one **ProjectToken** bonding-curve contract for that project.

```
Price
  │                              ╭─────
  │                          ╭───╯
  │                      ╭───╯
  │                  ╭───╯
  │              ╭───╯
  │    ──────────╯
  └──────────────────────────────────── Supply

  As more tokens are bought, price rises automatically.
  As tokens are sold, price falls.
  The curve is deterministic and transparent.
```

**Miner rewards:** Every accepted proposal that improves the benchmark score returns the miner's stake and mints the reward to the proposal's `rewardRecipient`. Rejected or expired proposals slash the miner's stake across the verifier-pool and burn paths.

### Current 0G Galileo Testnet Deployment

The create skill bundles the deployed ABI artifacts and manifest under `autoresearch-create/contracts/0g-galileo-testnet/`.

| Field | Value |
|---|---|
| Chain | 0G Galileo testnet |
| Chain ID | `16602` |
| RPC | `https://evmrpc-testnet.0g.ai` |
| `ProjectRegistry` | `0xc84768e450534974C0DD5BAb7c1b695744124136` |
| `ProposalLedger` | `0x701db5f8Ed847651209A438695dfe5520adD6A5A` |
| `VerifierRegistry` | `0x257974E406f206BfAEd3abB8D93C232e3226f032` |

**Miners** use the same addresses from a **vendored copy** under [`autoresearch-mine/contracts/0g-galileo-testnet/`](autoresearch-mine/contracts/0g-galileo-testnet/) (kept in sync with the create skill; no dependency on the create package at runtime).

Publishing an approved project calls:

```text
ProjectRegistry.createProject(
  protocolHash,
  repoSnapshotHash,
  benchmarkHash,
  baselineAggregateScore,
  baselineMetricsHash,
  tokenName,
  tokenSymbol,
  basePrice,
  slope,
  minerPoolCap
)
```

The emitted `ProjectCreated` event returns the canonical `projectId` and project token address. Miners then buy that project token, approve `ProposalLedger`, and submit proposals with a separate `rewardRecipient`.

---

### Layer 4 — Code Hosting (0G Storage + On-Chain Attestation)

Project artifacts live on 0G Storage for content-addressable storage, with on-chain root hashes for permanence and discoverability.

```
┌──────────────────────────────────────────────────────────────┐
│                     ON-CHAIN REGISTRY                         │
│                                                               │
│  project_id → {                                               │
│    protocol_hash: "0xabc...",     // 0G root of protocol     │
│    current_best: {                                            │
│      code_root: "0xdef...",       // 0G root of code         │
│      score: 0.847,                // benchmark metric         │
│      block: 19284756,             // when it was verified     │
│      miner: "0xDe3..."            // who submitted it         │
│    },                                                         │
│    benchmark_root: "0x123...",    // 0G root of bench suite  │
│    token: "0xTok...",             // bonding curve contract   │
│    git_log: [...],                // ordered list of roots   │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
```

The current create skill uploads the protocol, repo snapshot, benchmark bundle, and baseline metrics artifact to 0G Storage and stores the resulting root hashes on-chain. It also writes `storage_0g_galileo.json` so miners can retrieve and verify the exact files.

---

### Layer 5 — The Mining Loop (Karpathy-Inspired AutoResearch)

This is the engine. When a miner picks a project, the **`autoresearch-mine`** skill bootstraps a local AutoResearch loop against the published protocol and repo checkout (see [`autoresearch-mine/SKILL.md`](autoresearch-mine/SKILL.md)).

```
┌──────────────────────────────────────────────────────────────────┐
│                        MINER'S LOCAL LOOP                         │
│                                                                    │
│  ① Pull current best code + protocol + benchmark from registry    │
│                                                                    │
│  ② Start AutoResearch loop:                                        │
│     ┌─────────────────────────────────────────────────────────┐  │
│     │  current_best_score = fetch_current_best()              │  │
│     │                                                          │  │
│     │  while True:                                             │  │
│     │    hypothesis = agent.generate_hypothesis(sop, code)    │  │
│     │    new_code = agent.implement(hypothesis, code)         │  │
│     │    score = benchmark.run(new_code)                      │  │
│     │                                                          │  │
│     │    if score > current_best_score:                        │  │
│     │      code = new_code           # keep it                 │  │
│     │      current_best_score = score                          │  │
│     │    else:                                                  │  │
│     │      pass                      # discard it              │  │
│     │                                                          │  │
│     │    if score > network_best_score:                        │  │
│     │      prepare_submission()       # ready to submit PR     │  │
│     └─────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ③ When miner is satisfied, stake tokens + submit PR               │
└──────────────────────────────────────────────────────────────────┘
```

**The competitive mechanic:** The network publishes the current best score in real time. Miners are racing each other — submitting before your score advantage disappears is part of the strategy. If someone else submits a better result while you are still iterating, your submission will only be accepted if it still beats the new best.

**Miner incentive design:** Miners choose projects where:
- Token value × expected reward > cost of compute to find improvement
- The current benchmark gap is large enough to make improvement tractable
- The protocol aligns with their agent's strengths (e.g., a CUDA expert targets GPU kernels)

---

### Layer 6 — The Validator Network (TEE Nodes)

Miners are untrusted. They could fabricate benchmark results. The validator network prevents this.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VALIDATOR NODE (TEE)                          │
│                                                                       │
│  Hardware: Intel TDX / AMD SEV / AWS Nitro Enclaves                 │
│                                                                       │
│  On proposal submission:                                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  [Inside secure enclave — no external code can tamper]        │  │
│  │                                                                │  │
│  │  1. Pull code from IPFS (verified by CID hash)                │  │
│  │  2. Pull benchmark suite from IPFS (verified by CID hash)     │  │
│  │  3. Run benchmark in isolated environment                      │  │
│  │  4. Record result                                              │  │
│  │  5. Sign result with enclave's hardware-derived key           │  │
│  │  6. Publish signed attestation on-chain                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ProposalLedger gates review to VerifierRegistry allowlisted nodes   │
│  If approved: stake returned, reward minted, best score updated      │
│  If rejected/expired: stake slashed across verifier pool and burn    │
└─────────────────────────────────────────────────────────────────────┘
```

**Why TEE and not ZK proofs?** Both are viable. TEEs (specifically Intel TDX and AMD SEV) are chosen as the practical first step because:
- They can run arbitrary code, including GPU benchmarks, without circuit compilation
- Verification is fast and cheap (milliseconds vs. hours for zkML on large models)
- Hardware attestation is already battle-tested in production (AWS, Azure confidential compute)

zkML (zero-knowledge proofs for ML) remains the long-term ideal for fully trustless verification, as it does not require trusting hardware manufacturers. The protocol is designed so zkML validators can be added as an alternative verification path once the tooling matures.

**Validator economics:** Verifiers must be allowlisted in `VerifierRegistry`. They claim reviews through `ProposalLedger.claimReview(...)`, then approve or reject after rerunning the benchmark.

---

## Component Summary

| Component | What it does | Technology |
|---|---|---|
| **Agent Skills** | User-facing entry points for create, baseline, mine, validate, and status flows | Agent Skills spec + skills.sh |
| **Protocol Generator** | Reads an existing GitHub repo, derives the research spec, and proposes a benchmark contract | Host coding agent LLM + skill resources |
| **Sandbox Runner** | Executes the repo + benchmark in an isolated container to produce a verified, deterministic baseline score | Docker / Firecracker |
| **Token Contract** | Bonding curve token per project with miner rewards pool | Solidity / EVM |
| **Protocol Registry** | On-chain index of projects, current best scores, and project token addresses | Solidity + IPFS |
| **AutoResearch Loop** | Local agent loop that iterates on code and keeps only improvements (`autoresearch-mine` + bundled harness) | Python + AI coding agent |
| **Proposal Submission** | Packages improved code, benchmark claim, stake, and reward recipient into a transaction | CLI + smart contract |
| **TEE Validators** | Re-run benchmarks in secure hardware and attest results on-chain | Intel TDX / AMD SEV |
| **zkML Path** (future) | Cryptographic proof of benchmark execution without trusted hardware | EZKL / zkLLM |

---

## Token Flow — End to End

```
Project created
     │
     ▼
Bonding curve deployed ──────────────────────────────────────────┐
     │                                                            │
     │  Creator buys initial tokens at curve price              │
     │  (signals confidence in the project)                     │
     ▼                                                            │
Speculators / interested parties buy tokens                      │
(price rises → project gains visibility and capital)             │
     │                                                            │
     ▼                                                            │
Miner stakes tokens → submits proposal                            │
     │                                                            │
     ├── Validators attest TRUE                                   │
     │        │                                                   │
     │        ▼                                                   │
     │   Miner gets: stake back + token reward from miner pool   │
     │   Token price rises (supply constant, demand up)          │
     │                                                            │
     └── Validators attest FALSE                                  │
              │                                                   │
              ▼                                                   │
         Stake slashed → 50/50 verifier pool and burn paths      │
         Token price unaffected (no new supply released)         │
                                                                  │
     ◄────────────────────────────────────────────────────────────┘
     As miner pool empties, token scarcity increases
     → incentivizes early mining, rewards pioneers
```

---

## Quick Start (Skills in This Repo)

### Create (Phase 1 — researchers)

```bash
# Install this repository's skills into supported agents
npx skills add Auto-Research-At-Home/skill

# Or install only the create skill
npx skills add Auto-Research-At-Home/skill --skill autoresearch-create

# Create a project from an existing GitHub repo
> create an autoresearch project from https://github.com/your-org/your-repo

# The agent will clone or scan the repo, build a discovery bundle,
# ask the protocol questionnaire, write protocol.json, run a baseline,
# then ask whether to publish to the configured 0G Galileo registry.
```

The create skill includes discovery prompts, schema, questionnaire, baseline runner, `program.md` renderer, wallet publish flow, and 0G Galileo deployment artifacts under **`autoresearch-create/`**.

### Mine (Phase 2 — contributors)

Use **`autoresearch-mine`** with a finalized **`protocol.json`** and a checkout of **`meta.repo`**. The skill bundles the same baseline harness pattern as create (`vendor/harness/`), maintains **`.autoresearch/mine/`** (`trials.jsonl`, `network_state.json`), and can optionally read the on-chain best score (`sync_registry_frontier.py`) or submit a proposal (`submit_proposal.py`) using the vendored contract bundle. Install Python chain dependencies only if you use those scripts: **`pip install -r autoresearch-mine/requirements-chain.txt`** (prefer a venv). Environment variables and defaults are documented in [`autoresearch-mine/README.md`](autoresearch-mine/README.md) and [`autoresearch-mine/SKILL.md`](autoresearch-mine/SKILL.md).

```bash
npx skills add Auto-Research-At-Home/skill --skill autoresearch-mine
```

### Repository layout

```text
autoresearch-create/     # Phase 1 — protocol authoring, baseline, publish
autoresearch-mine/        # Phase 2 — mining loop, optional 0G frontier + submit
autoresearch-status/      # planned
autoresearch-validate/    # planned
```

---

## Related Work

| Project | What they do | How we differ |
|---|---|---|
| [karpathy/autoresearch](https://github.com/karpathy/autoresearch) | Single-machine autonomous ML experimentation | We decentralize and incentivize it at network scale |
| [Bittensor](https://bittensor.com) | Decentralized ML with subnet incentives | We focus on code improvement benchmarks, not model inference |
| [Gensyn](https://gensyn.ai) | Distributed ML training with proof-of-learning | We focus on research discovery, not training compute |
| [Radicle](https://radicle.dev) | Decentralized git and code collaboration | We use similar code hosting primitives with research incentives |
| [Nous Research](https://nousresearch.com) | Distributed open-source model training on Solana | We are domain-agnostic and benchmark-driven, not model-specific |

---

## How ARAH Differs from Bittensor

Bittensor miners serve inference requests — the output is consumed and gone. ARAH miners produce improved source code that becomes the permanent baseline every future miner must beat. The network compounds; Bittensor just runs.

Bittensor validators score miners subjectively, which is why validator cartels exist. ARAH uses a deterministic benchmark — a number a TEE computes, not an opinion anyone forms. There is nothing to collude around.

---

## License

MIT — all code contributions to projects on this protocol are open source by default.

---

*Built on the shoulders of Andrej Karpathy's autoresearch, Bittensor's subnet economics, and the broader DeSci movement.*
