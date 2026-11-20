# WalletLens

Goal: a polished public-address Solana token delegation checker, deployed later on Vercel.

## Architecture decision

Considered a Vite frontend with a separate Cloudflare Worker, and a Next.js application with a Vercel route handler. Choose Next.js for one deployment, same-origin requests, private RPC credentials, and a reusable server scanner. Telegram scheduling is future work. Durable private scan statistics were added after the user's follow-up request; see README for activation.

Data contract: POST /api/scan accepts { address: string }. A ScanResult owns wallet, cluster, checkedAt, totalAccounts, delegatedAccounts, and a clear scope statement. Delegated accounts include token account, mint, delegate, raw allowance, decimals, exact formatted allowance, balance, and program. Errors fail the whole scan when either program fails. UI state is a discriminated union of idle, loading, success and error. Demo data is explicitly labelled and never presented as a live scan.

Scope includes frontend, API, server RPC parsing, fixtures, tests, config, README and environment example. No subscriptions or bot this version. Wallet-approved account revocation was added at the user’s request; see the section below. Scan only account-level delegates, not Token-2022 permanent mint delegates or stake delegation. Do not claim wallet safety. The user subsequently requested private usage statistics; optional Upstash Redis storage and a token-protected admin API implement that addition.

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
- [x] Unit tests, typecheck and production build passed again from the final WalletLens directory.
- [ ] HTTP and interactive browser verification blocked by sandbox `listen EPERM` on 127.0.0.1:3000. Static preview navigation did not produce a verified page.
- [x] Keep changes reviewable. No remote configured; skip PR and deployment until requested.
- [x] Review final implementation against the contract. Independent backend probes passed; reported label contrast issues were corrected.

Implementation accepts the parent-approved rename to WalletLens and cached pinned Next.js 15.5.25. Source is formatted, RPC keys stay server-only, and body/label contrast and sizing were revised after independent review.

Type System Discipline shaped the validated request and RPC contracts. Prove It Works shaped the real-module tests and production build. Eight tests passed; live mainnet RPC calls remain unverified because no endpoint is configured and DNS is restricted here. The lockfile reuses existing package integrity records and was checked for dependency closure. Dependency installation from the registry is not verified in this environment.

## Wallet connection and revoke

The user requested connect-wallet and removal actions after seeing approvals. A public RPC proxy plus browser transaction construction was considered, but would expose RPC capability and duplicate account validation. Choose a narrow prepare/status backend and Wallet Standard sending signer. The server builds only one token Revoke instruction, checks mainnet, fresh ownership/mint/delegate, estimates v1 resources when supported, simulates and quotes the fee. The wallet keeps keys and performs signing/broadcast only after an explicit review. No signed transaction reaches WalletLens servers.

Data ownership: PrepareRevokeRequest owns the displayed approval identity and supported transaction version. PreparedRevoke owns its unsigned bytes, exact reviewed addresses/fee and recent blockhash lifetime. RevokeState is idle/preparing/review/signing/pending/confirmed/error; pending retains its signature even after disconnects or uncertain confirmation. The connected owner must match the scanned wallet and demo data cannot create a transaction. Mainnet is the existing product network and every review names it.

Scope reaches checker UI, wallet/revoke modules, prepare/status routes, shared token-program constants, styles, FAQ/docs, dependency manifest/lock and tests. Preserve private usage stats and dark theme. No batch revoke, wallet custody, transfer, close-account, mint permanent delegate removal or bot work.

Throughput checkpoint: blocking RPC/SDK contracts first; one implementation owner for coupled UI/API; exclusive worktree avoids shared source writes; parent independently reviews and verifies the resulting diff.

Revoke implementation verification: 21 tests, TypeScript checking and the production build passed in the isolated worktree. The feature patch was applied without replacing the existing private stats, dark theme, or user configuration. All 21 tests and TypeScript checks passed again in the main WalletLens directory. Independent final-byte probes reject transfer, wrong target, wrong blockhash, and priority-fee injection before wallet invocation. Browser wallet approval, real RPC integration, live signing and on-chain revocation were not executed. Local HTTP verification was attempted but blocked by sandbox EPERM.
