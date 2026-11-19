import { z } from "zod";
import {
  formatTokenAmount,
  SCAN_SCOPE,
  walletAddress,
  type ScanResult,
} from "./contracts";

export const TOKEN_PROGRAMS = [
  { id: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", label: "SPL Token" },
  { id: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", label: "Token-2022" },
] satisfies { id: string; label: "SPL Token" | "Token-2022" }[];

const rawAmount = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) <= 18446744073709551615n);
const amount = z.object({
  amount: rawAmount,
  decimals: z.number().int().min(0).max(255),
});
const tokenInfo = z
  .object({
    mint: walletAddress,
    owner: walletAddress,
    tokenAmount: amount,
    delegate: walletAddress.optional(),
    delegatedAmount: amount.optional(),
    state: z.enum(["initialized", "frozen"]),
  })
  .superRefine((info, ctx) => {
    if (Boolean(info.delegate) !== Boolean(info.delegatedAmount))
      ctx.addIssue({ code: "custom", message: "Incomplete delegation" });
    if (
      info.delegatedAmount &&
      info.delegatedAmount.decimals !== info.tokenAmount.decimals
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent decimals" });
  });
const rpcResult = z.object({
  jsonrpc: z.literal("2.0"),
  result: z.object({
    context: z.object({ slot: z.number().int().nonnegative() }),
    value: z.array(
      z.object({
        pubkey: walletAddress,
        account: z.object({
          owner: walletAddress,
          data: z.object({
            parsed: z.object({ type: z.literal("account"), info: tokenInfo }),
          }),
        }),
      }),
    ),
  }),
});

export class ScanError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export async function scanWallet({
  wallet,
  rpcUrl,
  fetcher = fetch,
}: {
  wallet: string;
  rpcUrl: string;
  fetcher?: typeof fetch;
}): Promise<ScanResult> {
  const address = walletAddress.parse(wallet);
  const batches = await Promise.all(
    TOKEN_PROGRAMS.map(async (program) => {
      let payload: unknown;
      try {
        const response = await fetcher(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: program.label,
            method: "getTokenAccountsByOwner",
            params: [
              address,
              { programId: program.id },
              { encoding: "jsonParsed", commitment: "confirmed" },
            ],
          }),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        if (!response.ok)
          throw new ScanError(
            response.status === 429
              ? "The RPC provider is busy. Please try again shortly."
              : "The RPC provider could not complete this scan.",
            response.status === 429 ? 503 : 502,
          );
        payload = await response.json();
      } catch (error) {
        if (error instanceof ScanError) throw error;
        throw new ScanError(
          "The RPC provider did not respond. Please try again.",
        );
      }
      const result = rpcResult.safeParse(payload);
      if (!result.success)
        throw new ScanError(
          "The RPC provider returned incomplete data. No scan result was produced.",
        );
      for (const entry of result.data.result.value) {
        if (
          entry.account.owner !== program.id ||
          entry.account.data.parsed.info.owner !== address
        )
          throw new ScanError(
            "The RPC provider returned inconsistent account data. Please try again.",
          );
      }
      return { program, accounts: result.data.result.value };
    }),
  );
  return {
    wallet: address,
    cluster: "mainnet-beta",
    checkedAt: new Date().toISOString(),
    totalAccounts: batches.reduce(
      (total, batch) => total + batch.accounts.length,
      0,
    ),
    delegatedAccounts: batches.flatMap(({ program, accounts }) =>
      accounts.flatMap((entry) => {
        const info = entry.account.data.parsed.info;
        if (!info.delegate || !info.delegatedAmount) return [];
        return [
          {
            account: entry.pubkey,
            mint: info.mint,
            delegate: info.delegate,
            program: program.label,
            rawAllowance: info.delegatedAmount.amount,
            allowance: formatTokenAmount(
              info.delegatedAmount.amount,
              info.tokenAmount.decimals,
            ),
            balance: formatTokenAmount(
              info.tokenAmount.amount,
              info.tokenAmount.decimals,
            ),
            decimals: info.tokenAmount.decimals,
          },
        ];
      }),
    ),
    scope: SCAN_SCOPE,
  };
}
