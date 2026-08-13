
export default function ContactPage() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <a href="/" style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </a>

        <div style={styles.badge}>SUPPORT</div>

        <h1 style={styles.title}>CONTACT</h1>

        <p style={styles.subtitle}>
          Need help with your account, subscription or access?
        </p>

        <div style={styles.card}>
          <div style={styles.label}>SUPPORT EMAIL</div>

          <a
            href="mailto:support@nobullshitsignals.com"
            style={styles.email}
          >
            support@nobullshitsignals.com
          </a>

          <p style={styles.text}>
            Use this address for account access, billing, subscriptions,
            technical issues and general support.
          </p>
        </div>

        <div style={styles.card}>
          <div style={styles.label}>BILLING & SUBSCRIPTIONS</div>

          <p style={styles.text}>
            Active subscribers can manage or cancel their subscription directly
            from the dashboard using the Manage Subscription option.
          </p>

          <a href="/login" style={styles.button}>
            GO TO ACCOUNT →
          </a>
        </div>

        <div style={styles.notice}>
          Trading-related questions are answered as general platform support.
          We do not provide personalised investment advice.
        </div>

        <div style={styles.footer}>
          <a href="/" style={styles.back}>
            ← BACK TO HOME
          </a>

          <div style={styles.links}>
            <a href="/terms" style={styles.back}>
              TERMS
            </a>

            <a href="/privacy" style={styles.back}>
              PRIVACY
            </a>
          </div>
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
    padding: "60px 20px 100px",
  },

  container: {
    maxWidth: 760,
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
    marginTop: 55,
    color: "#37f28b",
    border: "1px solid #23563b",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.5,
  },

  title: {
    fontSize: "clamp(42px,7vw,72px)",
    lineHeight: 1,
    marginTop: 22,
    marginBottom: 12,
  },

  subtitle: {
    color: "#89958f",
    lineHeight: 1.6,
    marginBottom: 35,
  },

  card: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 28,
    borderRadius: 9,
    marginBottom: 18,
  },

  label: {
    color: "#718078",
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 12,
    fontWeight: 900,
  },

  email: {
    display: "inline-block",
    color: "#37f28b",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 20,
    marginBottom: 15,
  },

  text: {
    color: "#9ca8a2",
    lineHeight: 1.7,
    margin: 0,
  },

  button: {
    display: "inline-block",
    marginTop: 20,
    background: "#37f28b",
    color: "#041008",
    textDecoration: "none",
    padding: "13px 18px",
    borderRadius: 5,
    fontWeight: 900,
    fontSize: 12,
  },

  notice: {
    marginTop: 25,
    border: "1px solid #6b5622",
    background: "#171308",
    color: "#f4c95d",
    padding: 16,
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 1.6,
  },

  footer: {
    borderTop: "1px solid #1d2924",
    marginTop: 45,
    paddingTop: 28,
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    flexWrap: "wrap",
  },

  links: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
  },

  back: {
    color: "#37f28b",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 12,
  },
};
