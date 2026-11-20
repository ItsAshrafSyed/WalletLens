"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, isTransactionSendingSigner } from "@solana/kit";
import { walletWithoutSigner } from "@solana/kit-plugin-wallet";
import {
  useConnectedWallet,
  useWallets,
  useWalletStatus,
} from "@solana/kit-plugin-wallet/react";
import {
  type DelegatedAccount,
  type ScanResult,
  formatTokenAmount,
} from "../lib/contracts";
import {
  assertRevokeApproval,
  chooseTransactionVersion,
  preparedRevoke,
  revokeStatus,
  type PreparedRevoke,
} from "../lib/revoke-contracts";
import { sendPreparedRevoke } from "../lib/revoke-wallet";

const client = createClient().use(
  walletWithoutSigner({
    chain: "solana:mainnet",
    autoConnect: false,
    storage: null,
    filter: (wallet) =>
      wallet.features.includes("solana:signAndSendTransaction"),
  }),
);

type RevokeState =
  | { kind: "idle" }
  | { kind: "preparing"; account: string }
  | { kind: "review"; prepared: PreparedRevoke }
  | { kind: "signing"; prepared: PreparedRevoke }
  | {
      kind: "pending";
      prepared: PreparedRevoke;
      signature: string;
      checking: boolean;
      message: string;
    }
  | { kind: "confirmed"; signature: string; message: string }
  | { kind: "error"; message: string; signature?: string };

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "The request could not be completed. Try again.";
    throw new Error(message);
  }
  return payload;
}

export function useWalletRevoke({
  report,
  onConfirmed,
}: {
  report: { result: ScanResult; demo: boolean } | null;
  onConfirmed: (owner: string) => Promise<boolean>;
}) {
  const connected = useConnectedWallet(client);
  const wallets = useWallets(client);
  const status = useWalletStatus(client);
  const [state, setState] = useState<RevokeState>({ kind: "idle" });
  const [connectionError, setConnectionError] = useState("");
  const operation = useRef(false);
  const busy =
    state.kind === "preparing" ||
    state.kind === "signing" ||
    state.kind === "pending" ||
    state.kind === "review";
  const owner = connected?.account.address ?? null;
  const pending = state.kind === "pending" ? state : null;

  useEffect(() => {
    if (state.kind === "review" && owner !== state.prepared.owner)
      setState({
        kind: "error",
        message:
          "Wallet changed. Prepare a new revoke with the token account owner.",
      });
  }, [owner, state]);

  useEffect(() => {
    if (!pending?.checking) return;
    let stopped = false;
    const { signature, prepared } = pending;
    void (async () => {
      for (let attempt = 0; attempt < 12 && !stopped; attempt++) {
        try {
          const response = revokeStatus.parse(
            await post("/api/revoke/status", {
              signature,
              lastValidBlockHeight: prepared.lastValidBlockHeight,
            }),
          );
          if (stopped) return;
          if (response.status === "confirmed") {
            const refreshed = await onConfirmed(prepared.owner);
            if (stopped) return;
            setState({
              kind: "confirmed",
              signature,
              message: refreshed
                ? "Revoke transaction confirmed. Check the refreshed report for the latest approval state."
                : "Revoke transaction confirmed, but the report could not refresh. Run another wallet check for the latest state.",
            });
            return;
          }
          if (response.status === "failed" || response.status === "expired") {
            setState({
              kind: "error",
              signature,
              message:
                response.status === "failed"
                  ? "The transaction failed on-chain. No revoke was confirmed. Refresh before preparing another."
                  : "The transaction was not found before its blockhash expired. Check Explorer and refresh before trying again.",
            });
            return;
          }
        } catch {
          if (stopped) return;
          setState({
            kind: "pending",
            prepared,
            signature,
            checking: false,
            message:
              "Confirmation is unavailable. The transaction may already have been sent. Check Explorer or recheck its status; do not submit it again.",
          });
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
      }
      if (!stopped)
        setState({
          kind: "pending",
          prepared,
          signature,
          checking: false,
          message:
            "Confirmation is taking longer than expected. Keep this signature and recheck before attempting another revoke.",
        });
    })();
    return () => {
      stopped = true;
    };
  }, [pending?.signature, pending?.checking, onConfirmed]);

  async function connect(wallet: (typeof wallets)[number]) {
    setConnectionError("");
    try {
      await client.wallet.connect(wallet);
    } catch {
      setConnectionError(
        "Wallet connection was not completed. Open your wallet and try again.",
      );
    }
  }
  async function disconnect() {
    try {
      await client.wallet.disconnect();
      setConnectionError("");
    } catch {
      setConnectionError(
        "The wallet could not disconnect. Try again in your wallet.",
      );
    }
  }
  async function prepare(account: DelegatedAccount) {
    if (operation.current || busy) return;
    operation.current = true;
    try {
      const current = client.wallet.getState().connected;
      if (
        !report ||
        report.demo ||
        current?.account.address !== report.result.wallet
      )
        throw new Error(
          "Connect the wallet that owns this token account. Demo approvals cannot be revoked.",
        );
      if (!current.signer || !isTransactionSendingSigner(current.signer))
        throw new Error(
          "This wallet cannot sign and send Solana transactions. Use a supported wallet.",
        );
      setState({ kind: "preparing", account: account.account });
      const input = {
        owner: report.result.wallet,
        account: account.account,
        mint: account.mint,
        delegate: account.delegate,
        program: account.program,
        version: chooseTransactionVersion(current.supportedTransactionVersions),
      };
      const prepared = preparedRevoke.parse(
        await post("/api/revoke/prepare", input),
      );
      for (const key of [
        "owner",
        "account",
        "mint",
        "delegate",
        "program",
        "version",
      ] satisfies (keyof typeof input)[])
        if (prepared[key] !== input[key])
          throw new Error(
            "The prepared revoke did not match this approval. Refresh and try again.",
          );
      assertRevokeApproval({
        prepared,
        connectedAddress:
          client.wallet.getState().connected?.account.address ?? null,
        scannedWallet: report.result.wallet,
        demo: report.demo,
      });
      setState({ kind: "review", prepared });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The revoke could not be prepared.",
      });
    } finally {
      operation.current = false;
    }
  }
  async function approve() {
    if (state.kind !== "review" || operation.current) return;
    operation.current = true;
    const { prepared } = state;
    let walletRequested = false;
    try {
      const current = client.wallet.getState().connected;
      assertRevokeApproval({
        prepared,
        connectedAddress: current?.account.address ?? null,
        scannedWallet: report?.result.wallet ?? "",
        demo: report?.demo ?? true,
      });
      if (!current?.signer || !isTransactionSendingSigner(current.signer))
        throw new Error(
          "Your wallet no longer supports signing and sending. Reconnect and prepare a new revoke.",
        );
      if (!current.supportedTransactionVersions.has(prepared.version))
        throw new Error(
          "Your wallet no longer supports this transaction version. Prepare a new revoke.",
        );
      setState({ kind: "signing", prepared });
      walletRequested = true;
      const signature = await sendPreparedRevoke({
        prepared,
        connectedAddress: current.account.address,
        scannedWallet: report?.result.wallet ?? "",
        demo: report?.demo ?? true,
        signer: current.signer,
        versions: current.supportedTransactionVersions,
      });
      setState({
        kind: "pending",
        prepared,
        signature,
        checking: true,
        message: "Transaction submitted. Waiting for network confirmation…",
      });
    } catch (error) {
      const rejected =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 4001;
      setState({
        kind: "error",
        message: rejected
          ? "You rejected the wallet request. No transaction was approved."
          : !walletRequested && error instanceof Error
            ? error.message
            : "The wallet request did not complete. Check your wallet activity before preparing another revoke; it may have submitted a transaction.",
      });
    } finally {
      operation.current = false;
    }
  }
  return {
    state,
    busy,
    connected,
    wallets,
    status,
    connectionError,
    connect,
    disconnect,
    prepare,
    approve,
    cancel: () => {
      if (
        state.kind === "review" ||
        state.kind === "error" ||
        state.kind === "confirmed"
      )
        setState({ kind: "idle" });
    },
    recheck: () => {
      if (state.kind === "pending")
        setState({
          ...state,
          checking: true,
          message: "Rechecking network confirmation…",
        });
    },
  };
}
type Flow = ReturnType<typeof useWalletRevoke>;

export function WalletPanel({
  flow,
  onUseAddress,
}: {
  flow: Flow;
  onUseAddress: (address: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const chooser = useRef<HTMLDialogElement>(null);
  const connectionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (flow.connected && chooser.current?.open) {
      chooser.current.close();
      connectionHeading.current?.focus();
    }
  }, [flow.connected]);
  if (!mounted) return null;
  const { connected, wallets, status, busy } = flow;
  const connecting = status === "connecting" || status === "disconnecting";
  return (
    <section
      className={`wallet-panel${connected ? " wallet-connected" : ""}`}
      aria-label="Wallet connection"
    >
      <h3 ref={connectionHeading} tabIndex={-1}>
        {connected ? "Your connected wallet" : "Want to remove an approval?"}
      </h3>
      {connected ? (
        <>
          <p className="wallet-address">
            {connected.wallet.name} · {connected.account.address}
          </p>
          <div className="wallet-actions">
            <button
              type="button"
              className="revoke-button"
              disabled={busy || connecting}
              onClick={() => onUseAddress(connected.account.address)}
            >
              Check this wallet
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy || connecting}
              onClick={() => void flow.disconnect()}
            >
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Connect the owner wallet to review and revoke individual token
            approvals. Scanning never requires a connection.
          </p>
          <div className="wallet-actions">
            <button
              className="revoke-button primary"
              type="button"
              disabled={busy || connecting}
              aria-haspopup="dialog"
              onClick={() => chooser.current?.showModal()}
            >
              Connect wallet
            </button>
          </div>
        </>
      )}
      {connected && flow.connectionError && (
        <p className="wallet-error" role="alert">
          {flow.connectionError}
        </p>
      )}
      <dialog
        ref={chooser}
        className="wallet-chooser"
        aria-labelledby="wallet-chooser-title"
        aria-describedby="wallet-chooser-description"
        onClick={(event) => {
          if (event.target === event.currentTarget) chooser.current?.close();
        }}
      >
        <div className="wallet-chooser-heading">
          <h2 id="wallet-chooser-title">Connect a wallet</h2>
          <button
            type="button"
            className="text-button"
            onClick={() => chooser.current?.close()}
          >
            Close
          </button>
        </div>
        <p id="wallet-chooser-description">
          Choose the wallet that owns these token accounts. Connecting does not
          request a signature.
        </p>
        <div className="wallet-options" aria-busy={connecting}>
          {wallets.map((wallet) => (
            <button
              className="revoke-button wallet-option"
              type="button"
              key={wallet.name}
              disabled={busy || connecting}
              onClick={() => void flow.connect(wallet)}
            >
              <span className="wallet-option-mark" aria-hidden="true">
                {wallet.name.slice(0, 1)}
              </span>
              {wallet.name}
            </button>
          ))}
        </div>
        {connecting && <p role="status">Waiting for your wallet…</p>}
        {status === "pending" && (
          <p role="status">Discovering available wallets…</p>
        )}
        {status !== "pending" && wallets.length === 0 && (
          <p>
            No supported wallets found. Open WalletLens in a wallet-enabled
            browser with a Solana Wallet Standard wallet installed.
          </p>
        )}
        {flow.connectionError && (
          <p className="wallet-error" role="alert">
            {flow.connectionError}
          </p>
        )}
      </dialog>
    </section>
  );
}

export function RevokeReview({ flow }: { flow: Flow }) {
  const { state } = flow;
  if (state.kind === "idle") return null;
  return (
    <section
      className="revoke-review"
      aria-label="Revoke transaction"
      aria-live="polite"
      aria-busy={state.kind === "preparing" || state.kind === "signing"}
    >
      {state.kind === "preparing" && (
        <p>Checking ownership, preparing the revoke and simulating it…</p>
      )}
      {(state.kind === "review" || state.kind === "signing") && (
        <>
          <h3>Review removal of this delegate</h3>
          <p>Solana mainnet · {state.prepared.program} · Simulation passed</p>
          <dl className="revoke-details">
            <dt>Token account</dt>
            <dd>{state.prepared.account}</dd>
            <dt>Token mint</dt>
            <dd>{state.prepared.mint}</dd>
            <dt>Delegate to remove</dt>
            <dd>{state.prepared.delegate}</dd>
            <dt>Owner and fee payer</dt>
            <dd>{state.prepared.owner}</dd>
            <dt>Estimated network fee</dt>
            <dd>{formatTokenAmount(state.prepared.feeLamports, 9)} SOL</dd>
          </dl>
          <p>
            This removes this account's entire delegated allowance. It transfers
            no tokens and does not close the account. Your wallet can adjust its
            network fee; review its final fee before approving.
          </p>
          <div className="wallet-actions">
            <button
              type="button"
              className="revoke-button primary"
              disabled={state.kind === "signing"}
              onClick={() => void flow.approve()}
            >
              {state.kind === "signing"
                ? "Approve in your wallet…"
                : "Approve in wallet"}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={state.kind === "signing"}
              onClick={flow.cancel}
            >
              Cancel
            </button>
          </div>
        </>
      )}
      {(state.kind === "pending" ||
        state.kind === "confirmed" ||
        state.kind === "error") && (
        <>
          <p
            role={state.kind === "error" ? "alert" : "status"}
            className={state.kind === "error" ? "wallet-error" : ""}
          >
            {state.message}
          </p>
          {state.signature && (
            <a
              className="transaction-link"
              href={`https://explorer.solana.com/tx/${state.signature}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction in Explorer
              <span className="transaction-signature">{state.signature}</span>
            </a>
          )}
          {state.kind === "pending" ? (
            <button
              className="revoke-button"
              type="button"
              disabled={state.checking}
              onClick={flow.recheck}
            >
              {state.checking ? "Checking confirmation…" : "Recheck status"}
            </button>
          ) : (
            <button className="text-button" type="button" onClick={flow.cancel}>
              Dismiss
            </button>
          )}
        </>
      )}
    </section>
  );
}
