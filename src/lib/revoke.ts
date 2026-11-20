import {
  AccountRole,
  address,
  blockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  createSolanaRpcFromTransport,
  createTransactionMessage,
  estimateResourceLimitsFactory,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  type TransactionMessageBytesBase64,
} from "@solana/kit";
import { z } from "zod";
import { TOKEN_PROGRAMS, walletAddress } from "./contracts";
import {
  preparedRevoke,
  revokeRequest,
  revokeStatus,
  statusRequest,
  type RevokeRequest,
} from "./revoke-contracts";

export class RevokeError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

function rpcClient(rpcUrl: string, fetcher: typeof fetch) {
  return createSolanaRpcFromTransport(async ({ payload, signal }) => {
    const response = await fetcher(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.any([
        AbortSignal.timeout(7000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (!response.ok)
      throw new RevokeError(
        "The RPC provider could not complete this request.",
      );
    return response.json();
  });
}

const accountResponse = z.object({
  value: z
    .object({
      owner: walletAddress,
      executable: z.literal(false),
      data: z.object({
        space: z.union([z.number().int().min(165), z.bigint().min(165n)]),
        parsed: z.object({
          type: z.literal("account"),
          info: z.object({
            owner: walletAddress,
            mint: walletAddress,
            delegate: walletAddress.optional(),
            state: z.enum(["initialized", "frozen"]),
          }),
        }),
      }),
    })
    .nullable(),
});

export function buildRevokeMessage(
  request: RevokeRequest,
  lifetime: { blockhash: string; lastValidBlockHeight: bigint },
) {
  const program = TOKEN_PROGRAMS.find((item) => item.label === request.program);
  if (!program) throw new RevokeError("Unsupported token program.", 400);
  const base = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash(lifetime.blockhash),
      lastValidBlockHeight: lifetime.lastValidBlockHeight,
    },
    setTransactionMessageFeePayer(
      address(request.owner),
      request.version === 1
        ? createTransactionMessage({ version: 1 })
        : request.version === 0
          ? createTransactionMessage({ version: 0 })
          : createTransactionMessage({ version: "legacy" }),
    ),
  );
  return appendTransactionMessageInstruction(
    {
      programAddress: address(program.id),
      accounts: [
        { address: address(request.account), role: AccountRole.WRITABLE },
        { address: address(request.owner), role: AccountRole.READONLY_SIGNER },
      ],
      // Both token programs define Revoke as discriminator 5 with no amount or recipient.
      data: new Uint8Array([5]),
    },
    base,
  );
}

export async function prepareRevoke({
  input,
  rpcUrl,
  fetcher = fetch,
  now = new Date(),
}: {
  input: RevokeRequest;
  rpcUrl: string;
  fetcher?: typeof fetch;
  now?: Date;
}) {
  const request = revokeRequest.parse(input);
  const rpc = rpcClient(rpcUrl, fetcher);
  if ((await rpc.getGenesisHash().send()) !== MAINNET_GENESIS)
    throw new RevokeError(
      "The RPC endpoint is not Solana mainnet. No transaction was prepared.",
      503,
    );
  const { value: account } = accountResponse.parse(
    await rpc
      .getAccountInfo(address(request.account), {
        encoding: "jsonParsed",
        commitment: "confirmed",
      })
      .send(),
  );
  if (!account)
    throw new RevokeError(
      "This token account no longer exists. Refresh the report.",
      409,
    );
  const program = TOKEN_PROGRAMS.find((item) => item.label === request.program);
  const info = account.data.parsed.info;
  if (account.owner !== program?.id || info.owner !== request.owner)
    throw new RevokeError(
      "The connected wallet does not own this token account under the expected token program.",
      403,
    );
  if (info.mint !== request.mint || info.delegate !== request.delegate)
    throw new RevokeError(
      "This approval changed or was already removed. Refresh the report.",
      409,
    );
  if (info.state === "frozen")
    throw new RevokeError(
      "This token account is frozen. Its freeze authority must thaw it before revocation.",
      409,
    );
  const latest = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const lifetime = z
    .object({
      value: z.object({
        blockhash: walletAddress,
        lastValidBlockHeight: z
          .bigint()
          .nonnegative()
          .max(BigInt(Number.MAX_SAFE_INTEGER)),
      }),
    })
    .parse(latest).value;
  const message = buildRevokeMessage(request, lifetime);
  const transaction =
    request.version === 1
      ? await (async () => {
          const v1 = buildRevokeMessage({ ...request, version: 1 }, lifetime);
          if (v1.version !== 1)
            throw new RevokeError("Unsupported transaction version.");
          const estimate = await estimateResourceLimitsFactory({ rpc })(v1, {
            commitment: "confirmed",
          });
          return compileTransaction(
            setTransactionMessageConfig(
              {
                computeUnitLimit: Math.min(
                  1_400_000,
                  Math.ceil(estimate.computeUnitLimit * 1.2),
                ),
                loadedAccountsDataSizeLimit: Math.min(
                  64 * 1024 * 1024,
                  Math.ceil(estimate.loadedAccountsDataSizeLimit / 32768) *
                    32768,
                ),
              },
              v1,
            ),
          );
        })()
      : compileTransaction(message);
  const encoded = getBase64EncodedWireTransaction(transaction);
  const simulation = await rpc
    .simulateTransaction(encoded, {
      encoding: "base64",
      sigVerify: false,
      commitment: "confirmed",
    })
    .send();
  const parsedSimulation = z
    .object({
      value: z.object({ err: z.unknown().refine((value) => value === null) }),
    })
    .safeParse(simulation);
  if (!parsedSimulation.success)
    throw new RevokeError(
      "Simulation failed. No wallet approval was requested. Check your SOL balance and refresh the report.",
      409,
    );
  const feeResult = await rpc
    .getFeeForMessage(
      getBase64Decoder().decode(
        transaction.messageBytes,
      ) as TransactionMessageBytesBase64,
      { commitment: "confirmed" },
    )
    .send();
  const fee = z
    .object({ value: z.bigint().nonnegative() })
    .safeParse(feeResult);
  if (!fee.success)
    throw new RevokeError(
      "The network could not quote a fee. Prepare a fresh revoke.",
      409,
    );
  return preparedRevoke.parse({
    ...request,
    transaction: encoded,
    feeLamports: fee.data.value.toString(),
    blockhash: lifetime.blockhash,
    lastValidBlockHeight: Number(lifetime.lastValidBlockHeight),
    cluster: "mainnet-beta",
    simulation: "passed",
    expiresAt: new Date(now.getTime() + 45_000).toISOString(),
  });
}

export async function checkRevokeStatus({
  input,
  rpcUrl,
  fetcher = fetch,
}: {
  input: z.infer<typeof statusRequest>;
  rpcUrl: string;
  fetcher?: typeof fetch;
}): Promise<z.infer<typeof revokeStatus>> {
  const request = statusRequest.parse(input);
  const rpc = rpcClient(rpcUrl, fetcher);
  if ((await rpc.getGenesisHash().send()) !== MAINNET_GENESIS)
    throw new RevokeError("The RPC endpoint is not Solana mainnet.", 503);
  const result = await rpc
    .getSignatureStatuses([signature(request.signature)], {
      searchTransactionHistory: true,
    })
    .send();
  const parsed = z
    .object({
      value: z
        .array(
          z
            .object({
              err: z.unknown().refine((value) => value !== undefined),
              confirmationStatus: z
                .enum(["processed", "confirmed", "finalized"])
                .nullable(),
            })
            .nullable(),
        )
        .length(1),
    })
    .parse(result).value[0];
  if (parsed?.err !== null && parsed?.err !== undefined)
    return { status: "failed" };
  if (
    parsed?.err === null &&
    (parsed.confirmationStatus === "confirmed" ||
      parsed.confirmationStatus === "finalized")
  )
    return { status: "confirmed" };
  if (parsed) return { status: "pending" };
  const height = z
    .bigint()
    .nonnegative()
    .parse(await rpc.getBlockHeight({ commitment: "confirmed" }).send());
  return {
    status:
      height > BigInt(request.lastValidBlockHeight) ? "expired" : "pending",
  };
}
