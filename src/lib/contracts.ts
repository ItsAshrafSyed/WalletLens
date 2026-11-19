import { isAddress } from "@solana/addresses";
import { z } from "zod";

export const walletAddress = z
  .string()
  .trim()
  .refine(isAddress, "Enter a valid Solana wallet address.");
export const scanRequest = z.object({ address: walletAddress });
export const SCAN_SCOPE =
  "Account-level SPL Token and Token-2022 delegates only. Permanent mint delegates, stake delegation, and other authorities are not checked.";
export const delegatedAccount = z.object({
  account: walletAddress,
  mint: walletAddress,
  delegate: walletAddress,
  program: z.enum(["SPL Token", "Token-2022"]),
  rawAllowance: z.string().regex(/^\d+$/),
  allowance: z.string(),
  balance: z.string(),
  decimals: z.number().int().min(0).max(255),
});
export const scanResult = z.object({
  wallet: walletAddress,
  cluster: z.literal("mainnet-beta"),
  checkedAt: z.iso.datetime(),
  totalAccounts: z.number().int().nonnegative(),
  delegatedAccounts: z.array(delegatedAccount),
  scope: z.string(),
});
export type ScanResult = z.infer<typeof scanResult>;
export type DelegatedAccount = z.infer<typeof delegatedAccount>;

export function formatTokenAmount(raw: string, decimals: number): string {
  const normalized = BigInt(raw)
    .toString()
    .padStart(decimals + 1, "0");
  if (!decimals) return normalized;
  const fraction = normalized.slice(-decimals).replace(/0+$/, "");
  return normalized.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}
