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

## How It Works — The Big Picture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        RESEARCHER (Project Creator)                   │
│                                                                        │
│  1. Installs skill:  npx autoresearch init                            │
│  2. Provides a GitHub repository URL                                  │
│  3. Agent reads + understands codebase, derives Statement of Purpose  │
│  4. Agent runs repo in sandbox → establishes baseline benchmark score │
│  5. Researcher reviews SOP + baseline, approves or refines            │
│  6. Bonding curve token is minted, project is published               │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Published to IPFS + on-chain registry
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        PROTOCOL REGISTRY                              │
│  - Statement of Purpose (immutable)                                   │
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

### Layer 1 — The CLI Interface

Users interact with the system through a skill installed into their existing AI coding agent:

```bash
# Claude Code users
claude mcp add autoresearch

# Codex CLI users  
codex skill add autoresearch

# Standalone
npx autoresearch
```

Once installed, the skill exposes two primary flows: **create** (for researchers starting a project) and **mine** (for contributors improving existing ones).

The skill handles all protocol interactions — project registration, token operations, PR submission, and stake management — invisibly beneath a natural-language interface. The user just describes what they want; the skill handles the rest.

---

### Layer 2 — Project Creation and the Statement of Purpose

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
│  ② Derive Statement of Purpose                                  │
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
              Researcher reviews SOP + baseline score
              Refines wording, adjusts metric weights, approves
                              │
                              ▼
              SOP + baseline score hashed and recorded on-chain
              (immutable — benchmark spec and baseline cannot be
               changed without forking to a new project)
```

**Why an existing repo, not a blank prompt?**

Starting from a real codebase gives the SOP credibility — the benchmarks are grounded in code that actually runs, the baseline score is a real measurement not a guess, and miners know exactly what they are improving. It also means the project creator is putting something real on the table, not just an idea. The sandbox run is the moment of truth: if the repo does not run cleanly in isolation, the project creator must fix it before the project can be listed. This keeps the registry populated only with actionable research targets.

The immutability of the SOP is critical. It prevents the project creator from moving the goalposts after miners have invested compute. The benchmark is the contract.

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

**Initial token distribution at project creation:**
| Allocation | Recipient | Rationale |
|---|---|---|
| 20% | Project creator | Reward for defining the problem |
| 15% | Protocol treasury | Funds validator infrastructure |
| 10% | Initial benchmark setter | Reward for v1 implementation |
| 55% | Miner rewards pool | Released over time to successful commits |

**Miner rewards:** Every accepted PR that improves the benchmark score releases tokens from the miner pool. The token release amount scales with the magnitude of the improvement — a 5% gain releases more tokens than a 0.1% gain. This creates a frontier effect: early improvements are large and richly rewarded; marginal improvements compete harder for smaller rewards.

**Token utility:**
- Governance: token holders vote on benchmark spec upgrades (versioned, not retroactive)
- Staking: miners must stake tokens to submit PRs, creating skin-in-the-game
- Revenue: a small fee on token trades funds ongoing validator operations

---

### Layer 4 — Code Hosting (IPFS + On-Chain Attestation)

Code lives on IPFS for content-addressable storage, with on-chain pointers for permanence and discoverability.

```
┌──────────────────────────────────────────────────────────────┐
│                     ON-CHAIN REGISTRY                         │
│                                                               │
│  project_id → {                                               │
│    sop_hash: "QmXyz...",          // IPFS CID of SOP         │
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
│  ① Pull current best code + SOP + benchmark from registry         │
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
- The SOP aligns with their agent's strengths (e.g., a CUDA expert targets GPU kernels)

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
| **CLI Skill** | User-facing entry point for create and mine flows | Claude Code / Codex plugin |
| **SOP Generator** | Reads an existing GitHub repo, derives the research spec, generates a benchmark harness, and runs a baseline score in sandbox | Claude API (claude-opus-4-7) + Docker |
| **Sandbox Runner** | Executes the repo + benchmark in an isolated container to produce a verified, deterministic baseline score | Docker / Firecracker |
| **Token Contract** | Bonding curve token per project with miner rewards pool | Solidity / EVM |
| **Protocol Registry** | On-chain index of projects, current best scores, and git history | Solidity + IPFS |
| **AutoResearch Loop** | Local agent loop that iterates on code and keeps only improvements | Python + AI coding agent |
| **PR Submission** | Packages improved code, benchmark claim, and stake into a transaction | CLI + smart contract |
| **TEE Validators** | Re-run benchmarks in secure hardware and attest results on-chain | Intel TDX / AMD SEV |
| **zkML Path** (future) | Cryptographic proof of benchmark execution without trusted hardware | EZKL / zkLLM |

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

## Honest Assessment

This is a genuinely interesting idea. Here is an honest breakdown of where it is strong and where it faces real challenges.

### What is strong

**The benchmark-as-oracle insight is correct and powerful.** It sidesteps the hardest problem in decentralized science — evaluating the quality of research — by demanding that research be expressed as measurable code improvement. This is not a compromise; it is actually what distinguishes engineering from speculation.

**The incentive structure is directionally right.** Miners bear cost (compute) to generate improvements, stake capital to submit, and earn only if their claim is independently verified. This is a real proof-of-useful-work system, unlike most crypto "compute" networks that burn energy on artificial problems.

**The TEE validator design is practical.** Unlike zkML (which today adds hours of proving time for large models), hardware attestation can verify a GPU benchmark in seconds. This is deployable now, not in two years.

**Composability with existing tools is a genuine moat.** Integrating as a Claude Code or Codex skill means the barrier to participation is near zero — researchers and miners use their existing tools. No new UI to learn.

**Parallelism compounds.** This is the part that is hard to appreciate from a single experiment. Karpathy ran ~12 experiments per hour on one machine. Ten thousand nodes running in parallel run 120,000 experiments per hour. Across a weekend, that is millions of benchmark evaluations. Some research problems that take a lab a year could be compressed to days.

### Where it faces real challenges

**Benchmark gaming is the hardest problem.** Miners will eventually find ways to pass a benchmark without genuinely solving the underlying problem — overfitting to the benchmark suite, finding adversarial inputs that score well, or exploiting edge cases in the evaluation harness. This is Goodhart's Law applied to code. Mitigation requires: held-out test sets revealed only to TEE validators, rotating benchmarks, and human review for significant milestones. It is not unsolvable, but it requires ongoing attention.

**Cold start for new projects.** A newly minted project has no miners and no token value. The researcher must either attract early miners through their reputation or front some token capital to signal commitment. This is similar to the cold start problem for any new market. A curated set of high-quality initial projects from known researchers would help enormously at launch.

**Benchmark computation cost for validators.** If a project involves training a large model (even a 5-minute window like Karpathy's), validator nodes need significant compute. This either limits the protocol to fast-running benchmarks or requires validators with serious hardware — both are constraints. A two-tier system (fast validators for small benchmarks, expensive validators for large ones, with economics tuned accordingly) is likely necessary.

**Legal and IP ambiguity.** If a miner's agent reads an existing open-source codebase, modifies it, and submits it, the licensing implications need clarity. The protocol should probably require all projects to declare an open-source license at creation, making all contributions irrevocably open.

**TEE trust assumptions.** TEEs trust the hardware manufacturer (Intel, AMD, AWS). This is a meaningful trust assumption — it is not fully trustless. The zkML path addresses this but is not ready for production at meaningful benchmark complexity today.

### The potential

If the benchmark gaming problem is managed and the cold start is solved for a handful of flagship projects, the compounding effect of parallel agent research is real. The most valuable applications are likely:

1. **ML efficiency** — where benchmarks are mature (perplexity, FLOPS, latency) and improvements have immediate commercial value
2. **Bioinformatics** — protein folding energy scores, docking benchmarks, sequence alignment — where objective functions already exist and the research community is large
3. **ZK proof systems** — proving time and verification cost are highly measurable, and improvements compound directly into blockchain scalability

The vision of a global, incentivized research compute network is the right long-term direction. The question is not whether it is a good idea — it clearly is — but whether the execution can maintain benchmark integrity at scale while keeping the economic model balanced.

---

## Roadmap

```
Phase 1 — Foundation (Months 1–3)
  ├── Claude Code skill: create + mine flows
  ├── SOP generator
  ├── Local AutoResearch loop integration
  ├── IPFS code hosting + on-chain registry (testnet)
  └── Manual validator MVP (trusted team runs TEE nodes)

Phase 2 — Token Launch (Months 4–6)
  ├── Bonding curve token contracts (audited)
  ├── 3–5 flagship research projects onboarded
  ├── Decentralized validator network (permissioned TEE operators)
  └── Miner leaderboard + project explorer UI

Phase 3 — Open Mining (Months 7–12)
  ├── Permissionless miner onboarding
  ├── Validator staking + slashing (full economics live)
  ├── Rotating held-out benchmark sets (anti-gaming)
  └── Cross-chain token support

Phase 4 — zkML Integration (Year 2)
  ├── zkML verification path as alternative to TEE
  ├── Hybrid consensus (TEE + zkML agreement)
  └── Fully trustless validator network
```

---

## Quick Start (Coming Soon)

```bash
# Install the skill into Claude Code
claude mcp add autoresearch-skill

# Create a project from an existing GitHub repo
> /autoresearch create https://github.com/your-org/your-repo

# The agent will read the repo, generate a Statement of Purpose,
# run a sandbox benchmark to establish a baseline score,
# and ask you to review + approve before minting the token.

# Mine an existing project
> /autoresearch mine

# Check your contributions
> /autoresearch status
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

Bittensor is the most well-known decentralized AI network. On the surface — miners, validators, token rewards for compute — ARAH looks similar. It is not. The differences are structural.

**What miners actually do**

Bittensor miners *serve* — they respond to inference requests continuously. The output is consumed and gone. There is no permanent artifact. Bittensor is a compute marketplace.

ARAH miners *research* — they produce improved source code that becomes the new canonical baseline for the project. Every accepted commit is a permanent, verifiable artifact. The network gets collectively smarter with each commit because every improvement raises the floor for the next iteration. ARAH is a research ratchet, not a compute market.

**The scoring problem**

This is the deepest difference. Bittensor validators score miners *subjectively* — a validator runs a miner's output through its own judgment, often another AI model. This means validators can be lazy, wrong, or collude with preferred miners. Emissions flow to miners that validators *like*, not miners that are objectively better. Validator cartels have captured entire Bittensor subnets.

ARAH uses a *deterministic benchmark* — a piece of code that runs and returns a number. There is no opinion. A TEE re-runs the exact benchmark on the exact code and produces the same result, or it does not. You cannot argue with it, bribe it, or collude with it.

**Token economics**

Bittensor has one token (TAO) distributed across all subnets via emission voting. Mining a bioinformatics subnet and mining an LLM inference subnet both compete for the same TAO pool — and subnet success depends on network-level politics, not research output quality.

ARAH has a bonding curve token *per project*. A protein folding project has its own token. Token value is coupled directly to that specific research outcome — better code drives demand for that token. A miner's upside is tied to the quality of the specific problem they are solving, not TAO holder preferences.

**The research contract**

Bittensor subnet creators control the scoring mechanism and can change it. Miners invest hardware and optimization work for a subnet, the creator tweaks scoring, and their advantage disappears. There is no binding contract protecting miners.

ARAH's SOP and benchmark spec are hashed on-chain at project creation and immutable. The research problem cannot change. If the creator wants a different direction, they fork — the original project continues independently. Miners know exactly what they are competing against, permanently.

| | Bittensor | ARAH |
|---|---|---|
| What miners produce | Inference responses (ephemeral) | Improved source code (permanent) |
| Scoring | Subjective validator opinion | Deterministic benchmark |
| Validator trust model | Stake-weighted human judgment | TEE hardware attestation |
| Token model | Single TAO across all subnets | Bonding curve per project |
| Research compound effect | No — miners just serve | Yes — each commit raises the floor |
| Problem specification | Subnet creator can change anytime | Immutable on-chain SOP |
| Miner skin in the game | Stake to join network | Stake per PR submission |
| Output | Inference service | Open source code |

The shortest version: Bittensor rewards *serving*. ARAH rewards *discovering*.

---

## License

MIT — all code contributions to projects on this protocol are open source by default.

---

*Built on the shoulders of Andrej Karpathy's autoresearch, Bittensor's subnet economics, and the broader DeSci movement.*
