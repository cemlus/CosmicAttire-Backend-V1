# Skill: Codebase Internalization

## Purpose
Help an agent quickly understand, map, and retain the structure of a codebase before making changes. The skill should turn a messy repo into a reliable mental model with minimal guesswork.

## When to use
Use this skill when:
- onboarding to a new repo
- debugging unfamiliar code
- planning refactors
- reviewing architecture before implementing features
- tracing data flow, state flow, or request flow

## Goal
By the end of the process, the agent should be able to answer:
- What does this codebase do?
- What are the major entrypoints?
- What are the core domains/modules?
- Where does data come from and where does it go?
- What are the important invariants?
- What should not be changed without care?

## Operating principles
1. Start broad, then narrow.
2. Prefer evidence from the code over assumptions.
3. Build a map before changing anything.
4. Separate facts, inferences, and unknowns.
5. Keep a running record of discoveries.
6. Identify the smallest testable path through the system.
7. Do not propose code changes until the codebase structure is understood.

## Inputs the skill expects
- repository root
- package manager and runtime
- app type: CLI, server, worker, monorepo, library, etc.
- existing docs, if any
- current task or bug

## Outputs the skill should produce
### 1. Repo summary
A short explanation of what the project does.

### 2. Architecture map
A structured overview of:
- entrypoints
- commands
- services
- routes/controllers
- DB layer
- utilities
- config/secrets
- external integrations
- tests

### 3. Execution flow
A step-by-step path for the main use cases.

### 4. Data model summary
Key tables, objects, schemas, and relationships.

### 5. Risk map
Potentially fragile areas, hidden assumptions, and places where changes may break behavior.

### 6. Change guide
What is safe to edit, what requires caution, and what should be tested first.

## Required workflow

### Phase 1: Inventory
Collect the top-level structure of the repo.

Look for:
- README
- package.json or equivalent
- tsconfig / config files
- src/ or app/ layout
- scripts
- env files
- Dockerfiles
- migration folders
- test folders

Produce a file tree summary.

### Phase 2: Entry point discovery
Find how the application starts.

Identify:
- main runtime entrypoint
- CLI bootstrap
- command registration
- server bootstrap
- background workers
- scheduled jobs

Explain what is called first and what it loads next.

### Phase 3: Domain decomposition
Split the codebase into domains.

Examples:
- auth
- payments
- users
- notifications
- file processing
- database access
- device integration

For each domain, note:
- files involved
- responsibilities
- key functions/classes
- external dependencies

### Phase 4: Data flow tracing
Trace one or two important flows end-to-end.

For each flow, identify:
- trigger
- inputs
- validation
- transformation
- persistence
- output
- error handling

Prefer the most business-critical flow.

### Phase 5: State and trust boundaries
Identify where the system trusts:
- user input
- device input
- database data
- cache data
- third-party responses

Note which values are authoritative and which are derived.

### Phase 6: Hidden complexity scan
Search for:
- duplicate logic
- large helper functions
- implicit coupling
- side effects
- race conditions
- transaction boundaries
- retry logic
- serialization/deserialization pitfalls
- environment-based behavior

### Phase 7: Working notes
Maintain a concise working notebook with:
- facts confirmed by code
- assumptions still unverified
- open questions
- files to inspect next

## Decision rules

### If the codebase is small
- read the whole tree
- identify all entrypoints
- make a compact summary

### If the codebase is medium or large
- focus first on the primary execution path
- then inspect supporting systems
- avoid getting stuck in low-value files

### If the codebase is unfamiliar
- prefer more summaries and fewer premature conclusions
- keep naming consistent with the code
- quote file names and function names precisely

## Standard deliverable format

### A. One-paragraph overview
What the system does.

### B. Repo map
Tree + modules + responsibilities.

### C. Main flow
Numbered sequence of events.

### D. Data model
Tables / objects / relationships.

### E. Risks and surprises
Things likely to break.

### F. Next best inspection targets
What to read next.

## Questions the skill should answer
- Which file is the true entrypoint?
- Where are commands registered?
- Where does validation happen?
- Where are database queries issued?
- Which functions are pure and which have side effects?
- Which parts are reusable helpers and which are business logic?
- Which code paths are critical for correctness?
- Which logic is duplicated and should be centralized?

## Memory rules
The skill should retain:
- architecture facts
- naming conventions
- important flows
- stable mental models

The skill should not over-retain:
- temporary debug notes
- one-off hypotheses
- details that are likely to change soon

## Output style
- concise but structured
- use headings
- use bullets only when useful
- prefer exact file and function names
- separate facts from suggestions

## Example interaction pattern
1. Inspect repo tree.
2. Identify entrypoint.
3. Trace one main flow.
4. Summarize modules.
5. Flag unknowns.
6. Suggest next files to inspect.

## Anti-patterns
Avoid:
- changing code before understanding it
- making architecture assumptions without evidence
- reading random files without a goal
- rewriting everything at once
- confusing derived values with source-of-truth values

## Final outcome
After using this skill, the agent should be able to explain the repository clearly enough to:
- debug it
- extend it
- review it
- refactor it safely
- onboard another developer quickly