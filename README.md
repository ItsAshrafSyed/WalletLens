# WalletLens

A Solana token delegation checker with optional owner-approved revocation. Paste a public wallet address to inspect account-level delegates without connecting. To remove an approval, connect its owner wallet, review the simulated revoke and network fee, then approve in the wallet.

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
src/app/api/admin/stats/   Token-protected private statistics endpoint
src/components/           Checker UI, Wallet Standard connection, revoke review and shared icons
src/lib/contracts.ts      Shared validated request/result contracts
src/lib/scan.ts           Server scanner, reusable by a future bot
src/lib/demo.ts           Explicitly fictional demonstration data
src/lib/stats.ts          Durable private counters and hashed wallet identifiers
src/app/api/revoke/       Narrow prepare and confirmation-status routes
src/lib/revoke*.ts        Revoke contracts, server builder and client transaction validation
tests/scan.test.ts        RPC fixtures and endpoint behavior tests
```

The server calls `getTokenAccountsByOwner` with `jsonParsed` separately for SPL Token and Token-2022 at confirmed commitment. Both queries must succeed and all returned token accounts must validate before a report is returned. A partial or unsupported response never becomes a clean report. The two RPC calls are separate snapshots, so this is not an atomic view at one slot.

Delegate approvals with zero remaining allowance are included. Amounts use decimal strings and BigInt formatting, never floating point. Allowances are limits, not necessarily available balances. Token names and prices are intentionally omitted rather than trusting unverified metadata.

## Deploy on Vercel

1. Push this folder as a repository and import it into Vercel.
2. Select Next.js and use Node.js 22 or newer. Use the committed pnpm lockfile.
3. Add `SOLANA_RPC_URL` in project environment variables, pointing to a **mainnet** endpoint. Never prefix it with `NEXT_PUBLIC_`.
4. Deploy. The API route is the backend; a separate Cloudflare service is unnecessary for this version.
5. Before opening to public traffic, configure Vercel Firewall rate limits for `/api/scan` and `/api/revoke/*`, plus RPC provider quotas. The endpoint is public and origin checks are not abuse protection. Every scan costs two RPC calls. No unreliable in-memory distributed rate limiter is included.

The endpoint has a 1 KB request-body limit, a 15-second RPC timeout and a 30-second function budget. Responses are not cached. Provider failures are sanitized so RPC keys do not appear in browser errors. Public addresses are sent to the configured RPC provider. The application does not persist raw addresses; hosting and RPC access logs have their own retention policies.

## Private usage statistics

Statistics have no public UI. The backend records successful live scans, failed RPC scans, unique successfully checked wallets, and UTC daily success/failure counts. Repeated checks increase scan counts but add the same wallet to the unique count once. Invalid requests, missing RPC configuration, and the browser-only demo do not count.

To enable recording:

1. Create an Upstash Redis database and copy its REST URL and read/write REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. Generate two independent secrets with `openssl rand -hex 32`. Set `STATS_HASH_KEY` to one and `STATS_ADMIN_TOKEN` to the other.
3. Add these four server-only environment variables in Vercel, or `.env.local` for local use. Use a separate Redis database for development/preview so those scans do not affect production counters.
4. Read the protected endpoint from your own terminal, with `STATS_ADMIN_TOKEN` loaded in the shell environment:

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $STATS_ADMIN_TOKEN" \
  https://your-domain.example/api/admin/stats
```

Never put the admin token in a URL or browser-side code. Missing or short admin tokens disable the endpoint; unauthorized requests cannot read counters. Responses are private and uncached. The endpoint returns lifetime totals and the most recent 30 UTC days, including today. Daily counts remain stored for future reporting.

Wallet uniqueness uses HMAC-SHA256 with `STATS_HASH_KEY`. Redis stores pseudonymous keyed hashes, not raw wallet addresses, IP addresses, or individual scan histories. Keep that key stable: changing it makes returning wallets appear new. The key is independent of the admin token so you can rotate admin access without changing wallet identities.

Each scan outcome uses one atomic Redis script to update counters and, for successful scans, the unique-wallet set. Analytics writes are awaited with a two-second timeout. If recording is unavailable, the scan result still returns and the server logs only `stats_write_failed`. These are best-effort operational statistics, not an accounting ledger; outages can leave gaps. No automatic write retries risk double counting. With all analytics storage variables empty, recording is disabled. Partial configuration logs a generic failure rather than silently recording in memory.

Uses the [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi) directly with the existing platform `fetch`; no new dependency or separate backend deployment is required.

## Scope

This is **not a wallet safety audit**. It checks account-level delegates on SPL Token and Token-2022 token accounts owned by the supplied wallet. It excludes Token-2022 permanent mint delegates, stake delegation, freeze/close authorities, compressed assets and other program permissions. Revocation is limited to individual account-level delegates owned by the connected wallet. No background monitoring runs.

The configured endpoint must be a Solana mainnet RPC provider. Scans trust deployment configuration for the network. Revoke preparation and status checking additionally verify the mainnet genesis hash.

## Connect and remove a delegation

Scanning remains connection-free. Supported Wallet Standard wallets are discovered in the browser; connect only when you intend to remove an approval. This version requires the wallet's `solana:signAndSendTransaction` capability. There is no wallet-specific adapter, automatic reconnection, seed phrase entry or server custody.

1. Check your wallet, then connect the account that owns it. You can also choose **Check this wallet** after connecting.
2. Choose **Remove delegation** on one real token-account result. Demo approvals cannot create a transaction. Another wallet's report remains read-only.
3. Review the full token account, mint, delegate, owner/fee payer, network fee, mainnet label and successful simulation result.
4. Choose **Approve in wallet**, then review and approve the wallet's own transaction request. A small SOL network fee is required; the revoke transfers no tokens and does not close the account.
5. Keep the transaction signature. WalletLens waits for confirmed/finalized status and refreshes the report. A processed, failed, expired or unknown transaction is never shown as a confirmed revoke. A refreshed approval can still exist if it was reapproved after revocation; inspect the latest report.

The server re-reads the token account and verifies its program, owner, mint and displayed delegate before building exactly one Revoke instruction. It checks `getGenesisHash`, simulates the exact unsigned transaction and quotes `getFeeForMessage`. Token-2022 and the original SPL Token program are both supported. Frozen accounts and multisig owners are not supported by this direct-owner flow. Preparation does not execute a transaction or prove wallet ownership by itself; only the owner's eventual signature authorizes the revoke.

Transactions use v1 when the wallet advertises support, with Kit-estimated compute and loaded-account limits. Smaller-wallet compatibility uses v0 or legacy. The client validates the actual prepared bytes against the reviewed program, accounts, owner, blockhash, version and single Revoke instruction before requesting wallet approval. Review expires after 45 seconds; an expired review requires fresh preparation. Wallets can adjust their final network fee, so also check the wallet's own approval screen.

RPC credentials remain server-only. The wallet signs and broadcasts through its Wallet Standard sending capability; WalletLens has no arbitrary RPC proxy or signed-transaction submission endpoint. Disconnecting or changing accounts invalidates an unsigned review. Once a wallet returns a signature, that signature remains visible even if connection or confirmation fails. Recheck the existing signature instead of automatically resending. If a wallet request fails without a signature, check wallet activity before retrying because the wallet might already have broadcast it.

Confirmation polling is bounded. If the network remains pending or the RPC is unavailable, use **Recheck status** or Explorer. A report-refresh failure is distinct from a transaction failure. Automatic post-confirmation scans use the existing private scan counters; no separate revoke analytics are stored.

## Expansion

The backend is already separated from the UI. Private usage counters are available once the Redis configuration above is supplied.

For Telegram monitoring, a Cloudflare Worker with scheduled triggers and D1 can own subscriptions, consent, previous scan state and notification deduplication. Reuse the scanner in that service. Telegram requires an actual ongoing monitoring service; the current UI deliberately makes no alert signup promise. Start with that deployment when building alerts rather than paying the complexity cost now.

References: [Solana account queries](https://solana.com/docs/rpc/http/gettokenaccountsbyowner), [delegate approvals](https://solana.com/docs/tokens/basics/approve-delegate), [permanent mint delegates](https://solana.com/docs/tokens/extensions/permanent-delegate), [Next.js server environment variables](https://nextjs.org/docs/app/guides/environment-variables).
