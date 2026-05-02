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
│  6. Bonding curve token is minted, project is published               │
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
│  4. Submits PR with benchmark proof                                   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ PR submitted with stake
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        VALIDATOR NETWORK (TEE Nodes)                  │
│                                                                        │
│  1. Reads submitted PR + benchmark claim                              │
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
```

The skills are portable Agent Skills: each capability is a directory with a `SKILL.md` file plus any supporting resources. The `skills` CLI installs them into supported hosts such as Claude Code, Cursor, and Codex.

The first shipped skill is **`autoresearch-create`**, which helps researchers start a project from an existing GitHub repository and produce a versioned experiment-loop `protocol.json` plus optional `program.md`. Future sibling skills will cover mining, validation, status, and publishing flows.

Skills handle the conversational, LLM-assisted workflow. Deterministic or long-running protocol actions — sandbox execution, wallet operations, validator services, and unattended mining — can later be backed by scripts or a CLI invoked by the skill when needed.

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

Each project mints its own token via a **bonding curve contract** deployed on-chain at project creation.

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

**Miner rewards:** Every accepted PR that improves the benchmark score releases tokens from the miner pool. The token release amount scales with the magnitude of the improvement — a 5% gain releases more tokens than a 0.1% gain. This creates a frontier effect: early improvements are large and richly rewarded; marginal improvements compete harder for smaller rewards.

---

### Layer 4 — Code Hosting (IPFS + On-Chain Attestation)

Code lives on IPFS for content-addressable storage, with on-chain pointers for permanence and discoverability.

```
┌──────────────────────────────────────────────────────────────┐
│                     ON-CHAIN REGISTRY                         │
│                                                               │
│  project_id → {                                               │
│    protocol_hash: "QmXyz...",     // IPFS CID of protocol    │
│    current_best: {                                            │
│      code_cid: "QmAbc...",        // IPFS CID of code        │
│      score: 0.847,                // benchmark metric         │
│      block: 19284756,             // when it was verified     │
│      miner: "0xDe3..."            // who submitted it         │
│    },                                                         │
│    benchmark_cid: "QmBnc...",     // IPFS CID of bench suite │
│    token: "0xTok...",             // bonding curve contract   │
│    git_log: [...],                // ordered list of CIDs    │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
```

Git history is preserved as an ordered chain of IPFS CIDs, each pointing to a diff, making the full research history verifiable and permanent. Nothing is deleted — even rejected attempts are logged as metadata (though not as the canonical code state) to prevent duplicate work.

---

### Layer 5 — The Mining Loop (Karpathy-Inspired AutoResearch)

This is the engine. When a miner picks a project, the skill bootstraps a local AutoResearch loop.

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
│  On PR submission:                                                    │
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
│  Smart contract collects N of M validator attestations               │
│  If majority agree: PR accepted, miner rewarded, state updated       │
│  If majority disagree: stake slashed, miner flagged                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Why TEE and not ZK proofs?** Both are viable. TEEs (specifically Intel TDX and AMD SEV) are chosen as the practical first step because:
- They can run arbitrary code, including GPU benchmarks, without circuit compilation
- Verification is fast and cheap (milliseconds vs. hours for zkML on large models)
- Hardware attestation is already battle-tested in production (AWS, Azure confidential compute)

zkML (zero-knowledge proofs for ML) remains the long-term ideal for fully trustless verification, as it does not require trusting hardware manufacturers. The protocol is designed so zkML validators can be added as an alternative verification path once the tooling matures.

**Validator economics:** Validators stake protocol tokens to join the network. They earn fees from each verification. Validators who consistently disagree with consensus are penalized — this prevents lazy validators from free-riding.

---

## Component Summary

| Component | What it does | Technology |
|---|---|---|
| **Agent Skills** | User-facing entry points for create, baseline, mine, validate, and status flows | Agent Skills spec + skills.sh |
| **Protocol Generator** | Reads an existing GitHub repo, derives the research spec, and proposes a benchmark contract | Host coding agent LLM + skill resources |
| **Sandbox Runner** | Executes the repo + benchmark in an isolated container to produce a verified, deterministic baseline score | Docker / Firecracker |
| **Token Contract** | Bonding curve token per project with miner rewards pool | Solidity / EVM |
| **Protocol Registry** | On-chain index of projects, current best scores, and git history | Solidity + IPFS |
| **AutoResearch Loop** | Local agent loop that iterates on code and keeps only improvements | Python + AI coding agent |
| **PR Submission** | Packages improved code, benchmark claim, and stake into a transaction | CLI + smart contract |
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
Miner stakes tokens → submits PR                                  │
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
         Stake slashed → redistributed to validators             │
         Token price unaffected (no new supply released)         │
                                                                  │
     ◄────────────────────────────────────────────────────────────┘
     As miner pool empties, token scarcity increases
     → incentivizes early mining, rewards pioneers
```

---

## Quick Start (Current Skill)

```bash
# Install this repository's skills into supported agents
npx skills add Auto-Research-At-Home/skill

# Or install only the create skill
npx skills add Auto-Research-At-Home/skill --skill autoresearch-create

# Create a project from an existing GitHub repo
> create an autoresearch project from https://github.com/your-org/your-repo

# The agent will clone or scan the repo, build a discovery bundle,
# ask the protocol questionnaire, and write protocol.json.
```

The current repository ships only `autoresearch-create`. Mining, status, validation, and on-chain publishing skills are planned sibling skills:

```text
autoresearch-create/
autoresearch-mine/       # future
autoresearch-status/     # future
autoresearch-validate/   # future
```

The create skill now includes its discovery prompts, schema, questionnaire, baseline runner, and `program.md` renderer under `autoresearch-create/`.

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
