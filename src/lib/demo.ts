import { SCAN_SCOPE, scanResult } from "./contracts";

// Fictional sample relationships. Never submitted to RPC or counted as a live scan.
export const demoResult = scanResult.parse({
  wallet: "9xQeWvG816bUx9EPfEZrRpxcXgEGS5cJ9PGG7SshpV7P",
  cluster: "mainnet-beta",
  checkedAt: "2026-01-01T00:00:00.000Z",
  totalAccounts: 12,
  scope: SCAN_SCOPE,
  delegatedAccounts: [
    {
      account: "So11111111111111111111111111111111111111112",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      delegate: "11111111111111111111111111111111",
      program: "SPL Token",
      rawAllowance: "250000000",
      allowance: "250",
      balance: "1,240.50",
      decimals: 6,
    },
    {
      account: "11111111111111111111111111111111",
      mint: "So11111111111111111111111111111111111111112",
      delegate: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      program: "SPL Token",
      rawAllowance: "0",
      allowance: "0",
      balance: "2.75",
      decimals: 9,
    },
  ],
});
