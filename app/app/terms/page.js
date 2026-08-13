
export default function TermsPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <a href="/" style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </a>

        <div style={styles.badge}>LEGAL</div>

        <h1 style={styles.title}>TERMS OF SERVICE</h1>

        <p style={styles.updated}>Last updated: 13 August 2026</p>

        <section style={styles.section}>
          <h2>1. About the Service</h2>
          <p>
            NO BULLSHIT SIGNALS provides market information, trading signals,
            market analysis and related tools focused primarily on WTI crude
            oil / USOIL.
          </p>
        </section>

        <section style={styles.section}>
          <h2>2. Not Financial Advice</h2>
          <p>
            The information and signals provided through the service are for
            informational purposes only. They do not constitute personal
            financial, investment, trading or other regulated advice.
          </p>
          <p>
            You remain solely responsible for deciding whether to enter,
            manage or close any trade.
          </p>
        </section>

        <section style={styles.section}>
          <h2>3. Trading Risk</h2>
          <p>
            Trading financial markets, particularly leveraged products such
            as CFDs, involves significant risk. You may lose some or all of
            the money committed to a trade.
          </p>
          <p>
            No signal, score, confidence level, target or previous result
            guarantees a future profit. Past performance is not a guarantee
            of future results.
          </p>
        </section>

        <section style={styles.section}>
          <h2>4. Signals</h2>
          <p>
            Signals may include information such as market direction, entry
            price, Stop Loss, profit targets, confidence levels and market
            scores.
          </p>
          <p>
            Signals are produced only when relevant market conditions are
            detected. There is no guaranteed minimum number of signals during
            any day, week or subscription period.
          </p>
        </section>

        <section style={styles.section}>
          <h2>5. Accounts</h2>
          <p>
            You are responsible for maintaining the security of your account
            and login credentials. You must not provide another person with
            access to your account or intentionally distribute restricted
            subscriber content.
          </p>
        </section>

        <section style={styles.section}>
          <h2>6. Free Trial</h2>
          <p>
            Eligible new users may receive a 14-day free trial. The current
            free trial does not require a payment card.
          </p>
          <p>
            Trial availability and conditions may be changed for future new
            registrations. Any applicable terms will be displayed before
            registration or purchase.
          </p>
        </section>

        <section style={styles.section}>
          <h2>7. Paid Plans</h2>
          <p>
            Paid subscriptions may provide different levels of access to
            signals, history, analytics and other platform features.
          </p>
          <p>
            Prices and included features will be displayed before a paid
            subscription is purchased.
          </p>
        </section>

        <section style={styles.section}>
          <h2>8. Availability</h2>
          <p>
            We aim to keep the service available and market data current, but
            uninterrupted availability cannot be guaranteed. Delays,
            technical failures, third-party outages or market-data issues may
            occasionally affect the service.
          </p>
        </section>

        <section style={styles.section}>
          <h2>9. Acceptable Use</h2>
          <p>
            You must not attempt to interfere with the platform, bypass
            access restrictions, obtain unauthorised access, scrape protected
            subscriber content or use the service for unlawful purposes.
          </p>
        </section>

        <section style={styles.section}>
          <h2>10. Intellectual Property</h2>
          <p>
            The platform design, branding, original content, signal
            presentation and proprietary platform materials are protected and
            may not be copied, republished, resold or commercially
            redistributed without permission.
          </p>
        </section>

        <section style={styles.section}>
          <h2>11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, NO BULLSHIT
            SIGNALS is not responsible for trading losses arising from a
            user's decision to act or not act on information provided through
            the service.
          </p>
          <p>
            Nothing in these Terms excludes or limits liability where doing
            so would be unlawful.
          </p>
        </section>

        <section style={styles.section}>
          <h2>12. Changes to These Terms</h2>
          <p>
            These Terms may be updated when the service, subscription model or
            legal requirements change. The latest version will be published
            on this page with an updated revision date.
          </p>
        </section>

        <div style={styles.notice}>
          <strong>RISK NOTICE</strong>
          <p>
            Trading leveraged financial products involves substantial risk.
            Never trade money you cannot afford to lose.
          </p>
        </div>

        <div style={styles.bottom}>
          <a href="/" style={styles.back}>
            ← BACK TO HOME
          </a>
        </div>
      </div>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "#050807",
    color: "#f4f7f5",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: "60px 20px",
  },

  container: {
    maxWidth: 850,
    margin: "0 auto",
  },

  logo: {
    color: "#f4f7f5",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 15,
    letterSpacing: 1,
  },

  green: {
    color: "#37f28b",
  },

  badge: {
    display: "inline-block",
    marginTop: 60,
    color: "#37f28b",
    border: "1px solid #23563b",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.5,
  },

  title: {
    fontSize: "clamp(38px,6vw,65px)",
    marginBottom: 10,
  },

  updated: {
    color: "#68756e",
    marginBottom: 50,
  },

  section: {
    borderTop: "1px solid #1d2924",
    padding: "25px 0",
    color: "#9ca8a2",
    lineHeight: 1.8,
  },

  notice: {
    marginTop: 40,
    border: "1px solid #6b5622",
    borderRadius: 7,
    padding: 25,
    color: "#b9b39d",
    lineHeight: 1.7,
  },

  bottom: {
    marginTop: 50,
    paddingTop: 30,
    borderTop: "1px solid #1d2924",
  },

  back: {
    color: "#37f28b",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 12,
  },
};
