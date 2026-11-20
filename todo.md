# Private scan statistics

- [x] Trace scan callers, tests, configuration and docs.
- [x] Compare storage shapes. Choose Upstash REST counters over a second Cloudflare deployment; use the existing fetch/Zod dependencies.
- [x] Define durable totals, UTC daily counters and a set of keyed wallet hashes. A successful actual scan updates success and unique counts; an attempted RPC failure updates failure counts. Invalid requests, missing RPC setup and demo interactions do not count.
- [x] Blocking first steps. Confirm Upstash REST command contract before writing storage code.
- [x] Independent workstreams. Single implementation owner for route/storage contracts.
- [x] Shared mutable state. Redis serializes counter updates in one atomic script.
- [x] Smallest safe decomposition. No admin UI or new deployment; one protected read endpoint.
- [x] Implement private recording, auth, configuration and documentation.
- [x] Verify storage command payloads, authorization, route recording, UTC dates, response validation, and fail-open behavior. Independent runtime probes also passed.
- [x] Run typecheck and production build. All 14 tests passed. No stats configuration names or storage keys appear in the client bundle.
- Skip real Redis execution: no local Redis binary or configured remote credentials are available. Storage integration tests mock the external service.
- Skip deployment and remote provisioning: not requested.

# Connect and revoke

- [x] Trace affected UI, scanner, docs and current SDK contracts.
- [x] Architect narrow preparation/status endpoints and a wallet-owned broadcast path.
- [x] Implement typed contracts, server validation/build/simulation and status tracking.
- [x] Implement connect, owner gating, explicit review, wallet approval, pending signature and refresh.
- [x] Update stale read-only product copy and setup docs.
- [x] Verify real transaction bytes, ownership/stale/failed simulation/status cases, client guards including tampered SOL-transfer rejection, full 21 tests/typecheck/build.
- Skip live signing/broadcast and deployment: not authorized for test execution.
