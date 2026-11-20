import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatTokenAmount,
  walletAddress,
  TOKEN_PROGRAMS,
} from "../src/lib/contracts";
import { scanWallet } from "../src/lib/scan";
import { POST } from "../src/app/api/scan/route";

const wallet = "11111111111111111111111111111111";
const mint = "So11111111111111111111111111111111111111112";

function account(program: string, delegateAmount: string | null = "250000001") {
  return {
    pubkey: mint,
    account: {
      owner: program,
      data: {
        parsed: {
          type: "account",
          info: {
            mint,
            owner: wallet,
            state: "initialized",
            tokenAmount: { amount: "9007199254740993000", decimals: 9 },
            ...(delegateAmount === null
              ? {}
              : {
                  delegate: mint,
                  delegatedAmount: { amount: delegateAmount, decimals: 9 },
                }),
          },
        },
      },
    },
  };
}
const rpc = (value: unknown[]) => ({
  jsonrpc: "2.0",
  id: "test",
  result: { context: { slot: 123 }, value },
});
function fetchMock(reply: (program: string) => unknown): typeof fetch {
  return async (_input, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    assert.ok(
      typeof body === "object" &&
        body !== null &&
        "params" in body &&
        Array.isArray(body.params),
    );
    const filter: unknown = body.params[1];
    assert.ok(
      typeof filter === "object" &&
        filter !== null &&
        "programId" in filter &&
        typeof filter.programId === "string",
    );
    return Response.json(reply(filter.programId));
  };
}

test("accepts only a real 32-byte base58 address", () => {
  assert.equal(walletAddress.parse(` ${wallet} `), wallet);
  for (const invalid of [
    "",
    "0".repeat(44),
    "1".repeat(31),
    "1".repeat(33),
    "z".repeat(44),
  ])
    assert.equal(walletAddress.safeParse(invalid).success, false);
});
test("formats exact u64 amounts without floating point", () => {
  assert.equal(
    formatTokenAmount("9007199254740993000", 9),
    "9007199254.740993",
  );
  assert.equal(formatTokenAmount("1", 9), "0.000000001");
  assert.equal(formatTokenAmount("1000000000", 9), "1");
  assert.equal(formatTokenAmount("0", 6), "0");
  assert.equal(formatTokenAmount("42", 0), "42");
});
test("checks both programs and preserves exhausted recorded delegates", async () => {
  const calls: string[] = [];
  const result = await scanWallet({
    wallet,
    rpcUrl: "https://rpc.invalid",
    fetcher: fetchMock((program) => {
      calls.push(program);
      return rpc([
        account(program, program === TOKEN_PROGRAMS[0].id ? "250000001" : "0"),
        account(program, null),
      ]);
    }),
  });
  assert.deepEqual(calls.sort(), TOKEN_PROGRAMS.map((p) => p.id).sort());
  assert.equal(result.totalAccounts, 4);
  assert.equal(result.delegatedAccounts.length, 2);
  assert.deepEqual(
    result.delegatedAccounts.map((a) => a.allowance),
    ["0.250000001", "0"],
  );
  assert.equal(result.delegatedAccounts[0].balance, "9007199254.740993");
});
test("returns no delegates only after both complete valid empty responses", async () => {
  const result = await scanWallet({
    wallet,
    rpcUrl: "https://rpc.invalid",
    fetcher: fetchMock(() => rpc([])),
  });
  assert.equal(result.totalAccounts, 0);
  assert.deepEqual(result.delegatedAccounts, []);
});
test("fails whole scan on RPC error, malformed account, wrong owner or incomplete delegation", async () => {
  const wrongOwner = account(TOKEN_PROGRAMS[0].id);
  wrongOwner.account.data.parsed.info.owner = mint;
  const incomplete = account(TOKEN_PROGRAMS[0].id);
  delete incomplete.account.data.parsed.info.delegatedAmount;
  for (const invalid of [
    { jsonrpc: "2.0", error: { message: "secret-key-must-not-leak" } },
    rpc([{ account: { data: ["base64", "base64"] } }]),
    rpc([wrongOwner]),
    rpc([incomplete]),
  ]) {
    await assert.rejects(
      scanWallet({
        wallet,
        rpcUrl: "https://rpc.invalid",
        fetcher: fetchMock((program) =>
          program === TOKEN_PROGRAMS[0].id ? invalid : rpc([]),
        ),
      }),
      /incomplete data|inconsistent account/,
    );
  }
});
test("sanitizes transport errors and handles rate limiting", async () => {
  await assert.rejects(
    scanWallet({
      wallet,
      rpcUrl: "https://rpc.invalid",
      fetcher: async () => {
        throw new Error("https://rpc.invalid/?api-key=secret");
      },
    }),
    { message: "The RPC provider did not respond. Please try again." },
  );
  await assert.rejects(
    scanWallet({
      wallet,
      rpcUrl: "https://rpc.invalid",
      fetcher: async () => new Response("secret", { status: 429 }),
    }),
    {
      message: "The RPC provider is busy. Please try again shortly.",
      status: 503,
    },
  );
});
function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://walletlens.test/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}
test("route rejects invalid JSON, invalid address, oversized body and foreign origins before RPC", async () => {
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal(
    (await POST(request(JSON.stringify({ address: "invalid" })))).status,
    400,
  );
  assert.equal((await POST(request("x".repeat(1025)))).status, 413);
  assert.equal(
    (
      await POST(
        request(JSON.stringify({ address: wallet }), {
          origin: "https://foreign.invalid",
        }),
      )
    ).status,
    403,
  );
});
test("route gives actionable configuration error without a secret", async () => {
  const previous = process.env.SOLANA_RPC_URL;
  delete process.env.SOLANA_RPC_URL;
  try {
    const response = await POST(request(JSON.stringify({ address: wallet })));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /SOLANA_RPC_URL/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    if (previous === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previous;
  }
});
