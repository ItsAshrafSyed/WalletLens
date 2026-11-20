import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { recordScan, readStats } from "../src/lib/stats";
import { GET } from "../src/app/api/admin/stats/route";
import { POST } from "../src/app/api/scan/route";

const wallet = "11111111111111111111111111111111";
const now = new Date("2026-01-01T00:00:00.000Z");
const environment = {
  UPSTASH_REDIS_REST_URL: "https://stats.invalid",
  UPSTASH_REDIS_REST_TOKEN: "private-storage-token",
  STATS_HASH_KEY: "a-private-hash-key-with-at-least-32-characters",
  STATS_ADMIN_TOKEN: "an-independent-admin-token-at-least-32-characters",
  SOLANA_RPC_URL: "https://rpc.invalid",
};

async function withEnvironment(run: () => Promise<void>) {
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, environment);
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("records UTC counters atomically and sends keyed hashes instead of wallet addresses", async () => {
  await withEnvironment(async () => {
    const commands: unknown[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      assert.equal(url, environment.UPSTASH_REDIS_REST_URL);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Bearer ${environment.UPSTASH_REDIS_REST_TOKEN}`,
      );
      const body: unknown = JSON.parse(String(init?.body));
      commands.push(body);
      assert.equal(String(init?.body).includes(wallet), false);
      return Response.json({ result: 1 });
    };
    await recordScan({ wallet, outcome: "success", now, fetcher });
    await recordScan({ wallet, outcome: "success", now, fetcher });
    await recordScan({ wallet, outcome: "failure", now, fetcher });
    const success = commands[0];
    assert.ok(Array.isArray(success));
    assert.deepEqual(success.slice(0, 1), ["EVAL"]);
    assert.deepEqual(success.slice(2), [
      3,
      "walletlens:stats:total",
      "walletlens:stats:day:2026-01-01",
      "walletlens:stats:wallets",
      "success",
      createHmac("sha256", environment.STATS_HASH_KEY)
        .update(wallet)
        .digest("hex"),
    ]);
    assert.equal(
      commands[0] && JSON.stringify(commands[0]),
      JSON.stringify(commands[1]),
    );
    assert.ok(typeof success[1] === "string");
    assert.match(success[1], /SADD/);
    assert.ok(Array.isArray(commands[2]));
    assert.deepEqual(commands[2].slice(-2), ["failure", ""]);
  });
});

test("reads validated totals and 30 UTC days across year boundaries", async () => {
  await withEnvironment(async () => {
    const result = await readStats({
      now,
      fetcher: async (_url, init) => {
        const body: unknown = JSON.parse(String(init?.body));
        assert.ok(Array.isArray(body));
        assert.equal(body[2], 32);
        assert.equal(body[5], "walletlens:stats:day:2025-12-03");
        assert.equal(body.at(-1), "walletlens:stats:day:2026-01-01");
        return Response.json({
          result: [12, 3, 8, ...Array.from({ length: 60 }, () => 0)],
        });
      },
    });
    assert.equal(result.successfulScans, 12);
    assert.equal(result.failedScans, 3);
    assert.equal(result.uniqueWallets, 8);
    assert.equal(result.daily.length, 30);
    assert.deepEqual(result.daily[0], {
      date: "2025-12-03",
      successfulScans: 0,
      failedScans: 0,
    });
    await assert.rejects(
      readStats({ fetcher: async () => Response.json({ result: [12] }) }),
    );
    await assert.rejects(
      readStats({
        fetcher: async () => Response.json({ error: "secret-error" }),
      }),
    );
  });
});

test("admin stats fail closed without a strong token and reject unauthorized requests before storage", async (t) => {
  await withEnvironment(async () => {
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      throw new Error("must not reach storage");
    });
    const request = (token?: string) =>
      new Request("https://walletlens.test/api/admin/stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request("wrong"))).status, 401);
    delete process.env.STATS_ADMIN_TOKEN;
    assert.equal((await GET(request())).status, 404);
    process.env.STATS_ADMIN_TOKEN = "weak";
    assert.equal((await GET(request("weak"))).status, 404);
    assert.equal(fetch.mock.callCount(), 0);
  });
});

test("authorized stats remain private and unavailable storage never leaks credentials", async (t) => {
  await withEnvironment(async () => {
    const fetch = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ result: Array.from({ length: 63 }, () => 0) }),
    );
    const request = new Request("https://walletlens.test/api/admin/stats", {
      headers: { Authorization: `Bearer ${environment.STATS_ADMIN_TOKEN}` },
    });
    const response = await GET(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Authorization");
    assert.match(await response.text(), /uniqueWallets/);
    fetch.mock.mockImplementation(async () => {
      throw new Error(environment.UPSTASH_REDIS_REST_TOKEN);
    });
    const failure = await GET(request);
    assert.equal(failure.status, 503);
    assert.equal(
      (await failure.text()).includes(environment.UPSTASH_REDIS_REST_TOKEN),
      false,
    );
  });
});

test("scan route counts actual outcomes once; storage failures preserve the scan result", async (t) => {
  await withEnvironment(async () => {
    const recorded: unknown[] = [];
    let rpcFails = false;
    let storageFails = false;
    t.mock.method(console, "error", () => {});
    t.mock.method(
      globalThis,
      "fetch",
      async (url: unknown, init?: RequestInit) => {
        if (url === environment.SOLANA_RPC_URL) {
          if (rpcFails) return new Response("RPC error", { status: 503 });
          return Response.json({
            jsonrpc: "2.0",
            result: { context: { slot: 123 }, value: [] },
          });
        }
        assert.equal(url, environment.UPSTASH_REDIS_REST_URL);
        recorded.push(JSON.parse(String(init?.body)));
        return storageFails
          ? new Response("secret", { status: 500 })
          : Response.json({ result: 1 });
      },
    );
    const request = (address = wallet) =>
      new Request("https://walletlens.test/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
    assert.equal((await POST(request("invalid"))).status, 400);
    assert.equal(recorded.length, 0);
    assert.equal((await POST(request())).status, 200);
    rpcFails = true;
    assert.equal((await POST(request())).status, 502);
    rpcFails = false;
    storageFails = true;
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.text()).includes("stats"), false);
    assert.equal(recorded.length, 3);
    assert.deepEqual(
      recorded.map((command) => {
        assert.ok(Array.isArray(command));
        return command.at(-2);
      }),
      ["success", "failure", "success"],
    );
  });
});

test("absent analytics config disables writes; partial config logs only a generic event", async (t) => {
  await withEnvironment(async () => {
    const logs = t.mock.method(console, "error", () => {});
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      throw new Error("not called");
    };
    for (const key of [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "STATS_HASH_KEY",
    ])
      delete process.env[key];
    await recordScan({ wallet, outcome: "success", fetcher });
    assert.equal(logs.mock.callCount(), 0);
    process.env.UPSTASH_REDIS_REST_URL = environment.UPSTASH_REDIS_REST_URL;
    await recordScan({ wallet, outcome: "success", fetcher });
    assert.equal(calls, 0);
    assert.deepEqual(logs.mock.calls[0].arguments, [
      { event: "stats_write_failed" },
    ]);
  });
});
