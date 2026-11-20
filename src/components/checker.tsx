"use client";

import { useCallback, useState, type FormEvent } from "react";
import { scanResult, walletAddress, type ScanResult } from "../lib/contracts";
import { demoResult } from "../lib/demo";
import { Icon } from "./icons";
import { WalletPanel, RevokeReview, useWalletRevoke } from "./wallet-revoke";

type ScanState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; result: ScanResult; demo: boolean };
const shorten = (value: string) => `${value.slice(0, 5)}…${value.slice(-5)}`;

function Address({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied");
    } catch {
      setMessage("Copy unavailable");
    }
    window.setTimeout(() => setMessage(""), 2400);
  }
  return (
    <span className="address-group">
      <a
        href={`https://explorer.solana.com/address/${value}`}
        target="_blank"
        rel="noreferrer"
        title={value}
        aria-label={`${label}: ${value}. Open Solana Explorer`}
      >
        {shorten(value)}
        <Icon name="external" size={12} />
      </a>
      <button
        type="button"
        className="copy-button"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        <Icon name={message === "Copied" ? "check" : "copy"} size={13} />
      </button>
      <span className="sr-only" role="status">
        {message}
      </span>
      {message && <span className="copy-message">{message}</span>}
    </span>
  );
}

export function Checker() {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<ScanState>({ kind: "idle" });
  const [pasteMessage, setPasteMessage] = useState("");

  const scan = useCallback(async (value: string) => {
    const parsed = walletAddress.safeParse(value);
    if (!parsed.success) {
      setState({
        kind: "error",
        message:
          "That address doesn't look right. Enter a valid Solana public wallet address.",
      });
      return false;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: parsed.data }),
        signal: AbortSignal.timeout(25_000),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The scan could not be completed. Please try again.";
        setState({ kind: "error", message });
        return false;
      }
      const result = scanResult.parse(payload);
      setState({ kind: "success", result, demo: false });
      return true;
    } catch {
      setState({
        kind: "error",
        message:
          "We couldn't complete the scan. Check your connection and try again.",
      });
      return false;
    }
  }, []);

  const revoke = useWalletRevoke({
    report:
      state.kind === "success"
        ? { result: state.result, demo: state.demo }
        : null,
    onConfirmed: scan,
  });
  const scanning = state.kind === "loading" || revoke.busy;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scanning) await scan(address);
  }

  async function paste() {
    try {
      setAddress((await navigator.clipboard.readText()).trim());
      setPasteMessage("");
    } catch {
      setPasteMessage("Paste with Ctrl+V or ⌘V in the address field.");
    }
  }

  return (
    <div className="checker-wrap" id="checker">
      <section className="checker" aria-labelledby="checker-title">
        <div className="checker-heading">
          <div>
            <span className="eyebrow">A little clarity, on-chain</span>
            <h2 id="checker-title">Check your wallet</h2>
          </div>
          <span className="network">
            <span />
            Solana mainnet
          </span>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="wallet-address">Public wallet address</label>
          <div
            className={`input-wrap ${state.kind === "error" ? "input-error" : ""}`}
          >
            <Icon name="wallet" size={21} />
            <input
              id="wallet-address"
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              placeholder="Enter a Solana wallet address"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              aria-invalid={state.kind === "error"}
              aria-describedby={
                state.kind === "error" ? "scan-error" : "address-help"
              }
              disabled={scanning}
            />
            <button
              type="button"
              className="paste"
              onClick={paste}
              disabled={scanning}
            >
              Paste
            </button>
          </div>
          <span className="sr-only" id="address-help">
            Enter a public Solana address. Never enter a private key or seed
            phrase.
          </span>
          {pasteMessage && (
            <p className="field-note" role="status">
              {pasteMessage}
            </p>
          )}
          <button className="scan-button" type="submit" disabled={scanning}>
            {state.kind === "loading" ? (
              <>
                <span className="spinner" />
                Checking both token programs…
              </>
            ) : (
              <>
                <Icon name="search" size={19} />
                Check delegations
              </>
            )}
          </button>
        </form>
        <div className="checker-bottom">
          <span>
            <Icon name="lock" size={14} />
            Scan without connecting or signing.
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setState({ kind: "success", result: demoResult, demo: true })
            }
            disabled={scanning}
          >
            Explore a demo
          </button>
        </div>
        {state.kind === "error" && (
          <div className="error-message" id="scan-error" role="alert">
            <Icon name="info" size={18} />
            <p>{state.message}</p>
          </div>
        )}
      </section>

      {(revoke.connected ||
        (state.kind === "success" &&
          !state.demo &&
          state.result.delegatedAccounts.length > 0)) && (
        <WalletPanel
          flow={revoke}
          onUseAddress={(value) => {
            setAddress(value);
            void scan(value);
          }}
        />
      )}
      <RevokeReview flow={revoke} />

      {state.kind === "success" && (
        <section
          className="results"
          aria-labelledby="results-title"
          aria-live="polite"
        >
          {state.demo && (
            <div className="demo-banner">
              <span className="demo-label">DEMO</span>Sample data to show how a
              scan looks. These are fictional approvals.
            </div>
          )}
          <div className="result-heading">
            <h2 id="results-title">
              {state.result.delegatedAccounts.length
                ? `${state.result.delegatedAccounts.length} delegation${state.result.delegatedAccounts.length === 1 ? "" : "s"} found`
                : "No delegations found"}
            </h2>
            <span
              className={`result-icon ${state.result.delegatedAccounts.length ? "has-delegates" : ""}`}
            >
              <Icon
                name={state.result.delegatedAccounts.length ? "eye" : "check"}
                size={24}
              />
            </span>
          </div>
          <div className="result-meta">
            <span>{state.result.totalAccounts} token accounts checked</span>
          </div>
          <div className="scanned-wallet">
            <span>Wallet</span>
            <Address value={state.result.wallet} label="scanned wallet" />
          </div>
          {state.result.delegatedAccounts.length > 0 && (
            <div className="account-list">
              {state.result.delegatedAccounts.map((account, index) => (
                <article
                  className="account-card"
                  key={`${account.program}-${account.account}`}
                >
                  <div className="account-top">
                    <div className="token-ident">
                      <span className={`token-mark token-${index % 2}`}>
                        <Icon name="link" size={18} />
                      </span>
                      <div>
                        <h3>Token account</h3>
                        <Address
                          value={account.account}
                          label="token account"
                        />
                      </div>
                    </div>
                    <span
                      className={`allowance-label ${account.rawAllowance === "0" ? "zero" : ""}`}
                    >
                      {account.rawAllowance === "0"
                        ? "Zero allowance"
                        : "Delegate approved"}
                    </span>
                  </div>
                  <dl className="account-details">
                    <div>
                      <dt>Token mint</dt>
                      <dd>
                        <Address value={account.mint} label="token mint" />
                      </dd>
                    </div>
                    <div>
                      <dt>Approved delegate</dt>
                      <dd>
                        <Address
                          value={account.delegate}
                          label="approved delegate"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Delegated allowance</dt>
                      <dd className="amount">
                        {account.allowance}
                        <span> tokens</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Current balance</dt>
                      <dd className="amount">
                        {account.balance}
                        <span> tokens</span>
                      </dd>
                    </div>
                  </dl>
                  {!state.demo && (
                    <div className="account-revoke">
                      <button
                        type="button"
                        className="revoke-button"
                        disabled={
                          scanning ||
                          revoke.connected?.account.address !==
                            state.result.wallet
                        }
                        onClick={() => void revoke.prepare(account)}
                      >
                        Remove delegation
                      </button>
                      {revoke.connected?.account.address !==
                        state.result.wallet && (
                        <p>
                          Connect this token account’s owner wallet to remove
                          its delegate.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="account-foot">
                    <span>{account.program}</span>
                    <span>
                      {account.rawAllowance === "0"
                        ? "Delegate is still recorded; current allowance is zero."
                        : "Allowance can exceed the current balance."}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
          <p className="result-scope">
            Token-account approvals only.
            <a className="text-button" href="#questions">
              Details
            </a>
          </p>
          <button
            type="button"
            className="text-button reset-results"
            disabled={revoke.busy}
            onClick={() => setState({ kind: "idle" })}
          >
            Close report
          </button>
        </section>
      )}
      <div className="scan-coverage">
        <span>Checks both token programs</span>
        <span className="coverage-divider" />
        <span>SPL Token</span>
        <span className="coverage-plus">+</span>
        <span>Token-2022</span>
      </div>
    </div>
  );
}
