# WalletLens

A read-only Solana token delegation checker. Paste a public wallet address to see recorded account-level delegates, their exact allowance, token mint, and account balance. No wallet connection or signature is involved.

## Run locally

Requires Node.js 22+ and pnpm. The lockfile pins dependencies.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Set SOLANA_RPC_URL to an HTTPS Solana mainnet RPC endpoint.
pnpm dev
```

Open http://localhost:3000. The clearly labelled demo works without an RPC key. Live scans return a configuration message until the RPC endpoint is set.

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

## Structure

```text
src/app/                  Page, layout, styles
src/app/api/scan/route.ts  POST /api/scan, HTTP validation and errors
src/components/           Checker UI and shared SVG icons
src/lib/contracts.ts      Shared validated request/result contracts
src/lib/scan.ts           Server scanner, reusable by a future bot
src/lib/demo.ts           Explicitly fictional demonstration data
tests/scan.test.ts        RPC fixtures and endpoint behavior tests
```

The server calls `getTokenAccountsByOwner` with `jsonParsed` separately for SPL Token and Token-2022 at confirmed commitment. Both queries must succeed and all returned token accounts must validate before a report is returned. A partial or unsupported response never becomes a clean report. The two RPC calls are separate snapshots, so this is not an atomic view at one slot.

Delegate approvals with zero remaining allowance are included. Amounts use decimal strings and BigInt formatting, never floating point. Allowances are limits, not necessarily available balances. Token names and prices are intentionally omitted rather than trusting unverified metadata.

## Deploy on Vercel

1. Push this folder as a repository and import it into Vercel.
2. Select Next.js and use Node.js 22 or newer. Use the committed pnpm lockfile.
3. Add `SOLANA_RPC_URL` in project environment variables, pointing to a **mainnet** endpoint. Never prefix it with `NEXT_PUBLIC_`.
4. Deploy. The API route is the backend; a separate Cloudflare service is unnecessary for this version.
5. Before opening to public traffic, configure Vercel Firewall rate limits for `/api/scan` and RPC provider quotas. The endpoint is public and origin checks are not abuse protection. Every scan costs two RPC calls. No unreliable in-memory distributed rate limiter is included.

The endpoint has a 1 KB request-body limit, a 15-second RPC timeout and a 30-second function budget. Responses are not cached. Provider failures are sanitized so RPC keys do not appear in browser errors. Public addresses are sent to the configured RPC provider. The application does not persist addresses; hosting and RPC access logs have their own retention policies.

## Scope

This is **not a wallet safety audit**. It checks account-level delegates on SPL Token and Token-2022 token accounts owned by the supplied wallet. It excludes Token-2022 permanent mint delegates, stake delegation, freeze/close authorities, compressed assets and other program permissions. It does not revoke approvals or build transactions. No background monitoring runs.

The configured endpoint must be a Solana mainnet RPC provider. This version trusts deployment configuration for the network and does not issue a genesis-hash request per scan.

## Expansion

The backend is already separated from the UI. For durable counts, add a database write after a successful live scan. Count completed scans separately from unique wallets and decide address retention before storing wallet identifiers. Demo checks must not count.

For Telegram monitoring, a Cloudflare Worker with scheduled triggers and D1 can own subscriptions, consent, previous scan state and notification deduplication. Reuse the scanner in that service. Telegram requires an actual ongoing monitoring service; the current UI deliberately makes no alert signup promise. Start with that deployment when building alerts rather than paying the complexity cost now.

References: [Solana account queries](https://solana.com/docs/rpc/http/gettokenaccountsbyowner), [delegate approvals](https://solana.com/docs/tokens/basics/approve-delegate), [permanent mint delegates](https://solana.com/docs/tokens/extensions/permanent-delegate), [Next.js server environment variables](https://nextjs.org/docs/app/guides/environment-variables).
