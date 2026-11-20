import { isBlockhash, isSignature } from "@solana/kit";
import { z } from "zod";
import { delegatedAccount, walletAddress } from "./contracts";

export const revokeRequest = z.object({
  owner: walletAddress,
  account: walletAddress,
  mint: walletAddress,
  delegate: walletAddress,
  program: delegatedAccount.shape.program,
  version: z.union([z.literal(1), z.literal(0), z.literal("legacy")]),
});
export type RevokeRequest = z.infer<typeof revokeRequest>;
export const preparedRevoke = revokeRequest.extend({
  transaction: z.string().min(1).max(6000),
  feeLamports: z.string().regex(/^\d+$/),
  blockhash: z.string().refine(isBlockhash),
  lastValidBlockHeight: z.number().int().nonnegative(),
  cluster: z.literal("mainnet-beta"),
  simulation: z.literal("passed"),
  expiresAt: z.iso.datetime(),
});
export type PreparedRevoke = z.infer<typeof preparedRevoke>;
export const statusRequest = z.object({
  signature: z.string().refine(isSignature),
  lastValidBlockHeight: z.number().int().nonnegative(),
});
export const revokeStatus = z.object({
  status: z.enum(["pending", "confirmed", "failed", "expired"]),
});

export function chooseTransactionVersion(
  versions: ReadonlySet<"legacy" | 0 | 1>,
) {
  if (versions.has(1)) return 1;
  if (versions.has(0)) return 0;
  if (versions.has("legacy")) return "legacy";
  throw new Error("This wallet does not support Solana transactions.");
}

export function assertRevokeApproval({
  prepared,
  connectedAddress,
  scannedWallet,
  demo,
  now = Date.now(),
}: {
  prepared: PreparedRevoke;
  connectedAddress: string | null;
  scannedWallet: string;
  demo: boolean;
  now?: number;
}) {
  if (demo) throw new Error("Demo approvals cannot be revoked.");
  if (connectedAddress !== prepared.owner || scannedWallet !== prepared.owner)
    throw new Error("Connect the wallet that owns this token account.");
  if (now >= Date.parse(prepared.expiresAt))
    throw new Error(
      "This review has expired. Prepare a fresh revoke before approving.",
    );
}
