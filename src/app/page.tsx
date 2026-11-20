import { Checker } from "../components/checker";
import { Icon } from "../components/icons";

function Brand() {
  return (
    <a className="brand" href="#" aria-label="WalletLens home">
      <span className="brand-icon">
        <Icon name="shield" size={22} />
      </span>
      Wallet<span>Lens</span>
    </a>
  );
}

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#questions">FAQ</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              Know who can
              <br />
              move your <span>tokens.</span>
            </h1>
          </div>
          <div className="orbit-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <span className="orbit-center">
              <Icon name="shield" size={37} />
            </span>
            <span className="orbit-node node-one">
              <Icon name="wallet" size={19} />
            </span>
            <span className="orbit-node node-two">
              <Icon name="link" size={17} />
            </span>
            <span className="orbit-dot dot-one" />
            <span className="orbit-dot dot-two" />
            <span className="orbit-caption">PERMISSION VISIBILITY</span>
          </div>
          <Checker />
        </section>
        <section className="trust-strip" aria-label="Tool principles">
          <span>
            <Icon name="eye" />
            Connection-free scans
          </span>
          <span>
            <Icon name="wallet" />
            Just your public address
          </span>
          <span>
            <Icon name="shield" />
            Your keys stay yours
          </span>
        </section>
        <section
          className="how-section content-width"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="section-intro">
            <div>
              <span className="eyebrow">Less guesswork. More visibility.</span>
              <h2 id="how-title">
                A wallet check,
                <br />
                without the wallet connection.
              </h2>
            </div>
            <p>
              Small approvals can be easy to forget.
              <br />
              Make them easier to understand.
            </p>
          </div>
          <div className="feature-grid">
            <article>
              <span className="feature-icon">
                <Icon name="wallet" size={24} />
              </span>
              <h3>Paste a public address</h3>
              <p>
                Check your own wallet or any Solana address. No sign-in and no
                wallet connection required.
              </p>
            </article>
            <article>
              <span className="feature-icon">
                <Icon name="search" size={24} />
              </span>
              <h3>Look at the permissions</h3>
              <p>
                We read token accounts from both token programs and find
                recorded account-level delegates.
              </p>
            </article>
            <article>
              <span className="feature-icon">
                <Icon name="eye" size={24} />
              </span>
              <h3>Understand the allowance</h3>
              <p>
                See the delegate, token mint, and exact approved amount. Open
                any address in Solana Explorer.
              </p>
            </article>
          </div>
        </section>
        <section className="scope-section content-width">
          <div className="scope-icon">
            <Icon name="info" size={24} />
          </div>
          <div>
            <h2>A focused check. A clear scope.</h2>
            <p>
              This tool checks token account delegate approvals. It doesn't
              check staking, Token-2022 permanent mint delegates, or every kind
              of wallet permission. A report without delegates is not a
              guarantee that a wallet is safe.
            </p>
          </div>
          <a
            href="https://solana.com/docs/tokens/basics/approve-delegate"
            target="_blank"
            rel="noreferrer"
          >
            About delegates
            <Icon name="external" size={15} />
          </a>
        </section>
        <section
          className="faq-section content-width"
          id="questions"
          aria-labelledby="faq-title"
        >
          <div className="faq-intro">
            <span className="eyebrow">Good questions</span>
            <h2 id="faq-title">
              A little context
              <br />
              goes a long way.
            </h2>
            <p>
              Understand what you're looking at
              <br />
              before deciding what to do next.
            </p>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                What is a token delegate?<span>+</span>
              </summary>
              <p>
                A token account owner can approve another address to transfer or
                burn a limited amount of that account's tokens. That address is
                called a delegate. Approval doesn't mean the delegate is
                malicious, but it's worth understanding who has access.
              </p>
            </details>
            <details>
              <summary>
                Does removing an approval move my tokens?<span>+</span>
              </summary>
              <p>
                Scanning only reads public data. Removing a delegate requires
                connecting the owner wallet and approving a simulated revoke
                transaction. The revoke transfers no tokens, but you pay a
                network fee in SOL. Never paste a seed phrase or private key
                here.
              </p>
            </details>
            <details>
              <summary>
                Does “no delegates” mean my wallet is safe?<span>+</span>
              </summary>
              <p>
                No. This is an account-level token delegation check. It does not
                check permanent mint delegates, staking, compromised keys,
                freeze authorities, other program permissions, or the
                trustworthiness of a token.
              </p>
            </details>
            <details>
              <summary>
                How do I remove an approval?<span>+</span>
              </summary>
              <p>
                Connect the wallet that owns the token account, then choose
                Remove delegation. Review the full account, delegate, fee and
                simulation result before approving in your wallet. WalletLens
                confirms the transaction and refreshes the report. Permanent
                mint delegates are outside this tool’s scope.
              </p>
            </details>
            <details>
              <summary>
                Will Telegram alerts be available?<span>+</span>
              </summary>
              <p>
                Monitoring and Telegram alerts are planned. This version only
                runs a check when you request it. It doesn't monitor wallets in
                the background or send notifications.
              </p>
            </details>
          </div>
        </section>
        <section className="next-chapter content-width">
          <span className="next-icon">
            <Icon name="bell" size={23} />
          </span>
          <div>
            <span className="eyebrow">On the horizon</span>
            <h2>A check today. A heads-up tomorrow.</h2>
            <p>
              Wallet monitoring and Telegram alerts are next on the roadmap.
            </p>
          </div>
          <span className="planned-pill">Planned</span>
        </section>
      </main>
      <footer className="site-footer content-width">
        <Brand />
        <p>A little more clarity for your on-chain life.</p>
        <span>Independent tool · Solana mainnet</span>
      </footer>
    </>
  );
}
