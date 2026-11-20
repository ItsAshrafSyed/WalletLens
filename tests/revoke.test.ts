import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  compileTransaction,
  getBase64EncodedWireTransaction,
  address,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  signature,
  signatureBytes,
  type Address,
  type TransactionSendingSigner,
} from "@solana/kit";
import {
  buildRevokeMessage,
  prepareRevoke,
  checkRevokeStatus,
  MAINNET_GENESIS,
} from "../src/lib/revoke";
import {
  chooseTransactionVersion,
  assertRevokeApproval,
  type RevokeRequest,
} from "../src/lib/revoke-contracts";
import { sendPreparedRevoke } from "../src/lib/revoke-wallet";
import { POST as prepareRoute } from "../src/app/api/revoke/prepare/route";
import { POST as statusRoute } from "../src/app/api/revoke/status/route";
import { TOKEN_PROGRAMS } from "../src/lib/contracts";

const owner: Address = address("Vote111111111111111111111111111111111111111");
const account: Address = address("So11111111111111111111111111111111111111112");
const mint: Address = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const delegate: Address = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const now = new Date("2026-11-20T00:00:00.000Z");
const request: RevokeRequest = {
  owner,
  account,
  mint,
  delegate,
  program: "SPL Token",
  version: 0,
};
const txSignature = signature(
  getBase58Decoder().decode(new Uint8Array(64).fill(7)),
);
function tokenAccount(program = TOKEN_PROGRAMS[0].id) {
  return {
    value: {
      executable: false,
      owner: program,
      lamports: 2039280,
      rentEpoch: 0,
      space: 165,
      data: {
        program: "spl-token",
        space: 165,
        parsed: {
          type: "account",
          info: { owner, mint, delegate, state: "initialized" },
        },
      },
    },
  };
}
function fixture({
  info = tokenAccount(),
  genesis = MAINNET_GENESIS,
  simulationError = null,
  fee = 5000,
  status = null,
  height = 90,
}: {
  info?: unknown;
  genesis?: string;
  simulationError?: unknown;
  fee?: number | null;
  status?: unknown;
  height?: number;
} = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    assert.ok(
      typeof body === "object" &&
        body !== null &&
        "method" in body &&
        typeof body.method === "string" &&
        "params" in body &&
        Array.isArray(body.params),
    );
    calls.push({ method: body.method, params: body.params });
    let result: unknown;
    switch (body.method) {
      case "getGenesisHash":
        result = genesis;
        break;
      case "getAccountInfo":
        result = { context: { slot: 10 }, ...Object(info) };
        break;
      case "getLatestBlockhash":
        result = {
          context: { slot: 10 },
          value: { blockhash: owner, lastValidBlockHeight: 100 },
        };
        break;
      case "simulateTransaction":
        result = {
          context: { slot: 10 },
          value: {
            err: simulationError,
            unitsConsumed: 800,
            loadedAccountsDataSize: 10000,
            logs: [],
          },
        };
        break;
      case "getFeeForMessage":
        result = { context: { slot: 10 }, value: fee };
        break;
      case "getSignatureStatuses":
        result = { context: { slot: 10 }, value: [status] };
        break;
      case "getBlockHeight":
        result = height;
        break;
      default:
        throw new Error(`Unexpected RPC ${body.method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: "test", result });
  };
  return { fetcher, calls };
}

test("prepared v0 and legacy transactions only revoke the expected account for both token programs", async () => {
  for (const program of TOKEN_PROGRAMS)
    for (const version of [0, "legacy"] satisfies (0 | "legacy")[]) {
      const rpc = fixture({ info: tokenAccount(program.id) });
      const result = await prepareRevoke({
        input: { ...request, program: program.label, version },
        rpcUrl: "https://rpc.invalid",
        fetcher: rpc.fetcher,
        now,
      });
      assert.equal(result.feeLamports, "5000");
      assert.equal(result.simulation, "passed");
      const wire = getBase64Encoder().encode(result.transaction);
      const tx = getTransactionDecoder().decode(wire);
      assert.deepEqual(Object.keys(tx.signatures), [owner]);
      const message = getCompiledTransactionMessageDecoder().decode(
        tx.messageBytes,
      );
      assert.equal(message.version, version);
      assert.deepEqual(message.staticAccounts, [owner, account, program.id]);
      assert.equal(message.header.numSignerAccounts, 1);
      assert.equal(message.instructions.length, 1);
      const instruction = message.instructions[0];
      assert.equal(instruction.programAddressIndex, 2);
      assert.ok(instruction.accountIndices);
      assert.ok(instruction.data);
      assert.deepEqual([...instruction.accountIndices], [1, 0]);
      assert.deepEqual([...instruction.data], [5]);
      const simulation = rpc.calls.find(
        (call) => call.method === "simulateTransaction",
      );
      assert.equal(simulation?.params[0], result.transaction);
      assert.equal(result.expiresAt, "2026-11-20T00:00:45.000Z");
    }
});

test("v1 uses measured resources and simulates the exact final wire transaction", async () => {
  const rpc = fixture();
  const result = await prepareRevoke({
    input: { ...request, version: 1 },
    rpcUrl: "https://rpc.invalid",
    fetcher: rpc.fetcher,
    now,
  });
  const simulations = rpc.calls.filter(
    (call) => call.method === "simulateTransaction",
  );
  assert.equal(simulations.length, 2);
  assert.equal(simulations[1].params[0], result.transaction);
  const tx = getTransactionDecoder().decode(
    getBase64Encoder().encode(result.transaction),
  );
  const message = getCompiledTransactionMessageDecoder().decode(
    tx.messageBytes,
  );
  assert.equal(message.version, 1);
  assert.ok(message.version === 1);
  assert.equal(message.numInstructions, 1);
  assert.deepEqual(
    message.configValues.map((item) => item.value),
    [960, 32768],
  );
});

test("wrong network, owner, program, stale delegate, mint, frozen or absent account fail before signing", async () => {
  const wrongOwner = tokenAccount();
  wrongOwner.value.data.parsed.info.owner = mint;
  const wrongDelegate = tokenAccount();
  wrongDelegate.value.data.parsed.info.delegate = account;
  const wrongMint = tokenAccount();
  wrongMint.value.data.parsed.info.mint = account;
  const frozen = tokenAccount();
  frozen.value.data.parsed.info.state = "frozen";
  for (const rpc of [
    fixture({ genesis: account }),
    fixture({ info: wrongOwner }),
    fixture({ info: tokenAccount(TOKEN_PROGRAMS[1].id) }),
    fixture({ info: wrongDelegate }),
    fixture({ info: wrongMint }),
    fixture({ info: frozen }),
    fixture({ info: { value: null } }),
  ]) {
    await assert.rejects(
      prepareRevoke({
        input: request,
        rpcUrl: "https://rpc.invalid",
        fetcher: rpc.fetcher,
      }),
      /mainnet|own|changed|frozen|exists/,
    );
    assert.equal(
      rpc.calls.some((call) => call.method === "simulateTransaction"),
      false,
    );
  }
});

test("simulation failure and missing fee never produce an approval review", async () => {
  await assert.rejects(
    prepareRevoke({
      input: request,
      rpcUrl: "https://rpc.invalid",
      fetcher: fixture({ simulationError: { InstructionError: [0, "Custom"] } })
        .fetcher,
    }),
    /Simulation failed/,
  );
  await assert.rejects(
    prepareRevoke({
      input: request,
      rpcUrl: "https://rpc.invalid",
      fetcher: fixture({ fee: null }).fetcher,
    }),
    /quote a fee/,
  );
});

test("status requires explicit error-free confirmed/finalized and preserves processed transactions", async () => {
  const input = { signature: txSignature, lastValidBlockHeight: 100 };
  for (const confirmationStatus of ["confirmed", "finalized"]) {
    const result = await checkRevokeStatus({
      input,
      rpcUrl: "https://rpc.invalid",
      fetcher: fixture({ status: { err: null, confirmationStatus } }).fetcher,
    });
    assert.equal(result.status, "confirmed");
  }
  assert.equal(
    (
      await checkRevokeStatus({
        input,
        rpcUrl: "https://rpc.invalid",
        fetcher: fixture({
          status: { err: null, confirmationStatus: "processed" },
          height: 101,
        }).fetcher,
      })
    ).status,
    "pending",
  );
  assert.equal(
    (
      await checkRevokeStatus({
        input,
        rpcUrl: "https://rpc.invalid",
        fetcher: fixture({
          status: {
            err: { InstructionError: [] },
            confirmationStatus: "confirmed",
          },
        }).fetcher,
      })
    ).status,
    "failed",
  );
  assert.equal(
    (
      await checkRevokeStatus({
        input,
        rpcUrl: "https://rpc.invalid",
        fetcher: fixture({ height: 101 }).fetcher,
      })
    ).status,
    "expired",
  );
  assert.equal(
    (
      await checkRevokeStatus({
        input,
        rpcUrl: "https://rpc.invalid",
        fetcher: fixture().fetcher,
      })
    ).status,
    "pending",
  );
  await assert.rejects(
    checkRevokeStatus({
      input,
      rpcUrl: "https://rpc.invalid",
      fetcher: fixture({ status: { confirmationStatus: "confirmed" } }).fetcher,
    }),
  );
});

test("wallet approval guards stop demos, mismatched owners, expired reviews and unsupported versions before wallet invocation", async () => {
  assert.equal(chooseTransactionVersion(new Set([0, 1])), 1);
  assert.equal(chooseTransactionVersion(new Set([0])), 0);
  assert.equal(chooseTransactionVersion(new Set(["legacy"])), "legacy");
  assert.throws(() => chooseTransactionVersion(new Set()), /does not support/);
  const prepared = await prepareRevoke({
    input: request,
    rpcUrl: "https://rpc.invalid",
    fetcher: fixture().fetcher,
    now,
  });
  let sent = 0;
  const signer: TransactionSendingSigner = {
    address: address(owner),
    signAndSendTransactions: async () => {
      sent++;
      return [signatureBytes(new Uint8Array(64).fill(7))];
    },
  };
  const args = {
    prepared,
    connectedAddress: owner,
    scannedWallet: owner,
    demo: false,
    signer,
    versions: new Set([0] satisfies (0 | 1 | "legacy")[]),
    now: now.getTime(),
  };
  for (const bad of [
    { ...args, demo: true },
    { ...args, connectedAddress: mint },
    { ...args, scannedWallet: mint },
    { ...args, now: now.getTime() + 45000 },
    { ...args, versions: new Set<0 | 1 | "legacy">() },
    { ...args, signer: null },
  ])
    await assert.rejects(sendPreparedRevoke(bad));
  const withTransfer = appendTransactionMessageInstruction(
    {
      programAddress: address("11111111111111111111111111111111"),
      accounts: [
        { address: address(owner), role: AccountRole.WRITABLE_SIGNER },
        { address: address(mint), role: AccountRole.WRITABLE },
      ],
      data: new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
    },
    buildRevokeMessage(request, {
      blockhash: owner,
      lastValidBlockHeight: 100n,
    }),
  );
  await assert.rejects(
    sendPreparedRevoke({
      ...args,
      prepared: {
        ...prepared,
        transaction: getBase64EncodedWireTransaction(
          compileTransaction(withTransfer),
        ),
      },
    }),
    /does not match/,
  );
  await assert.rejects(
    sendPreparedRevoke({ ...args, prepared: { ...prepared, account: mint } }),
    /does not match/,
  );
  assert.equal(sent, 0);
  assert.equal(await sendPreparedRevoke(args), txSignature);
  assert.equal(sent, 1);
  assert.throws(
    () =>
      assertRevokeApproval({
        prepared,
        connectedAddress: null,
        scannedWallet: owner,
        demo: false,
        now: now.getTime(),
      }),
    /owns/,
  );
});

function http(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request("https://walletlens.test/api/revoke/prepare", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
test("HTTP boundaries reject invalid/oversized/cross-origin bodies and sanitize RPC failures", async (t) => {
  assert.equal((await prepareRoute(http("{"))).status, 400);
  assert.equal((await prepareRoute(http({ owner: "invalid" }))).status, 400);
  assert.equal((await prepareRoute(http("x".repeat(2049)))).status, 413);
  assert.equal(
    (await prepareRoute(http(request, { Origin: "https://foreign.invalid" })))
      .status,
    403,
  );
  assert.equal(
    (await statusRoute(http({ signature: "invalid", lastValidBlockHeight: 1 })))
      .status,
    400,
  );
  const previous = process.env.SOLANA_RPC_URL;
  process.env.SOLANA_RPC_URL = "https://rpc.invalid/?key=SECRET";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("SECRET should never reach the user");
  });
  try {
    const response = await prepareRoute(http(request));
    assert.equal(response.status, 502);
    assert.equal((await response.text()).includes("SECRET"), false);
  } finally {
    if (previous === undefined) delete process.env.SOLANA_RPC_URL;
    else process.env.SOLANA_RPC_URL = previous;
  }
});
