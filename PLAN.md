# WalletLens

Goal: a polished public-address Solana token delegation checker, deployed later on Vercel.

## Architecture decision

Considered a Vite frontend with a separate Cloudflare Worker, and a Next.js application with a Vercel route handler. Choose Next.js for one deployment, same-origin requests, private RPC credentials, and a reusable server scanner. Telegram scheduling and durable scan statistics are future work, not simulated counters.

Data contract: POST /api/scan accepts { address: string }. A ScanResult owns wallet, cluster, checkedAt, totalAccounts, delegatedAccounts, and a clear scope statement. Delegated accounts include token account, mint, delegate, raw allowance, decimals, exact formatted allowance, balance, and program. Errors fail the whole scan when either program fails. UI state is a discriminated union of idle, loading, success and error. Demo data is explicitly labelled and never presented as a live scan.

Scope includes frontend, API, server RPC parsing, fixtures, tests, config, README and environment example. No signing, revoking, analytics database, subscriptions, or bot this version. Scan only account-level delegates, not Token-2022 permanent mint delegates or stake delegation. Do not claim wallet safety.

## Throughput checkpoint

- Blocking first steps. Confirm RPC contracts and architecture before implementation.
- Independent workstreams. One implementation owner; parent independently validates and reviews afterward.
- Shared mutable state. Implementation uses its own Git worktree.
- Smallest safe decomposition. A single owner keeps UI/API contracts consistent for this small app.

## Checklist

- [x] Trace the affected subsystem.
- [x] Architect the shape.
- [x] Write the throughput checkpoint.
- [x] Delegate code-writing.
- [x] Unit tests, typecheck and production build passed. Parent owns HTTP/browser verification.
- [x] Keep changes reviewable. No remote configured; skip PR and deployment until requested.
- [ ] Review final implementation against the contract.

Implementation accepts the parent-approved rename to WalletLens and cached pinned Next.js 15.5.25. Source is formatted, RPC keys stay server-only, and body/label contrast and sizing were revised after independent review.
