
export default function PrivacyPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <a href="/" style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </a>

        <div style={styles.badge}>LEGAL</div>

        <h1 style={styles.title}>PRIVACY POLICY</h1>

        <p style={styles.updated}>Last updated: 13 August 2026</p>

        <section style={styles.section}>
          <h2>1. Information We Collect</h2>
          <p>
            We may collect information you provide when creating or using an
            account, such as your email address, account identifiers and
            subscription information.
          </p>
        </section>

        <section style={styles.section}>
          <h2>2. Account and Authentication Data</h2>
          <p>
            Authentication services are currently provided using Supabase.
            Authentication data may be processed by Supabase as necessary to
            create accounts, authenticate users and provide password recovery.
          </p>
        </section>

        <section style={styles.section}>
        <h2>3. Payment Information</h2>
        <p>
        Subscription payments are processed by third-party payment providers
        such as Stripe. We do not store full payment card details directly on
        our servers. Payment providers may process information necessary to
        complete payments, manage subscriptions, prevent fraud and comply with
        legal obligations.
          </p>
        </section>

        <section style={styles.section}>
          <h2>4. How We Use Information</h2>
          <p>
            We may use personal information to operate accounts, manage
            subscription access, provide the service, maintain security,
            respond to support requests and improve platform functionality.
          </p>
        </section>

        <section style={styles.section}>
          <h2>5. Service Providers</h2>
          <p>
            We may use third-party infrastructure and service providers for
            hosting, authentication, databases, email delivery, payments and
            other technical services required to operate the platform.
          </p>
        </section>

        <section style={styles.section}>
          <h2>6. Security</h2>
          <p>
            We use reasonable technical and organisational measures intended
            to protect account and platform data. However, no online service
            can guarantee absolute security.
          </p>
        </section>

        <section style={styles.section}>
          <h2>7. Data Retention</h2>
          <p>
            Personal information may be retained for as long as necessary to
            provide the service, maintain legitimate business records,
            resolve disputes, prevent abuse or comply with legal obligations.
          </p>
        </section>

        <section style={styles.section}>
          <h2>8. Your Rights</h2>
          <p>
            Depending on where you live, you may have rights regarding your
            personal information, including requesting access, correction or
            deletion of certain personal data.
          </p>
        </section>

        <section style={styles.section}>
          <h2>9. Cookies and Similar Technologies</h2>
          <p>
            The platform may use cookies or similar technologies where
            necessary for authentication, session management, security and
            essential site functionality.
          </p>
        </section>

        <section style={styles.section}>
          <h2>10. Changes to This Policy</h2>
          <p>
            This Privacy Policy may be updated as the service, infrastructure
            or legal requirements change. The latest version will be
            published on this page with an updated revision date.
          </p>
        </section>

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
