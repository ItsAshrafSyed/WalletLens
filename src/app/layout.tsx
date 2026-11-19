import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WalletLens · Solana token delegation checker",
  description:
    "See which Solana token accounts have an approved delegate. Check a public wallet address, without connecting your wallet.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
