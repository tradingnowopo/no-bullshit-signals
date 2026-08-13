export default function Home() {
  const signals = [
    { time: "14:35", market: "WTI", direction: "LONG", confidence: "72%", result: "+1.24%" },
    { time: "12:10", market: "WTI", direction: "SHORT", confidence: "81%", result: "+0.87%" },
    { time: "09:45", market: "WTI", direction: "LONG", confidence: "68%", result: "+0.54%" },
  ];

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <div style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </div>

        <div style={styles.navRight}>
          <a href="#performance" style={styles.navLink}>
  Performance
</a>
          <a href="#pricing" style={styles.navLink}>
  Pricing
</a>
          <a href="/login" style={styles.login}>
  LOG IN
</a>
        </div>
      </nav>

      <section style={styles.hero}>
        <div style={styles.badge}>● WTI MARKET INTELLIGENCE</div>

        <h1 style={styles.title}>
          NO CARDS.<br />
          NO COFFEE GROUNDS.<br />
          <span style={styles.green}>NO BULLSHIT.</span>
        </h1>

        <p style={styles.subtitle}>
          Stop guessing where crude oil is going.
          <br />
          Data-driven WTI market signals delivered when they matter.
        </p>

        <div style={styles.buttons}>
          <a href="/signup" style={styles.primary}>
  START 14 DAYS FREE →
</a>
          <a href="#performance" style={styles.secondary}>
  VIEW PERFORMANCE
</a>
        </div>

        <p style={styles.small}>No credit card required.</p>
      </section>

      <section style={styles.signalSection}>
        <div style={styles.sectionLabel}>LATEST MARKET SIGNAL</div>

        <div style={styles.signalCard}>
          <div>
            <div style={styles.live}>
              <span style={styles.dot}></span> LIVE SIGNAL
            </div>

            <h2 style={styles.wti}>WTI / USOIL</h2>
            <p style={styles.muted}>Crude Oil · 15 minute outlook</p>
          </div>

          <div style={styles.direction}>
            <span style={styles.muted}>DIRECTION</span>
            <strong style={styles.long}>LONG ↑</strong>
          </div>

          <div style={styles.direction}>
            <span style={styles.muted}>CONFIDENCE</span>
            <strong style={styles.confidence}>72%</strong>
          </div>
        </div>
      </section>

      <section id="performance" style={styles.performance}>
        <div style={styles.sectionLabel}>RECENT SIGNALS</div>

        <div style={styles.table}>
          {signals.map((signal, index) => (
            <div style={styles.row} key={index}>
              <span>{signal.time}</span>
              <strong>{signal.market}</strong>

              <span
                style={
                  signal.direction === "LONG"
                    ? styles.long
                    : styles.short
                }
              >
                {signal.direction}
              </span>

              <span>{signal.confidence}</span>
              <strong style={styles.result}>{signal.result}</strong>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.philosophy}>
        <div style={styles.cross}>🃏 <span>CARDS</span> ✕</div>
        <div style={styles.cross}>☕ <span>COFFEE GROUNDS</span> ✕</div>
        <div style={styles.cross}>🔮 <span>CRYSTAL BALLS</span> ✕</div>
        <div style={styles.yes}>📊 <span>MARKET DATA</span> ✓</div>
      </section>

      <section id="pricing" style={styles.pricing}>
        <div style={styles.sectionLabel}>CHOOSE YOUR ACCESS</div>

        <h2 style={styles.pricingTitle}>
          14 DAYS FREE.
          <br />
          THEN YOU DECIDE.
        </h2>

        <div style={styles.plans}>
          <Plan
            name="PRO"
            price="£14.99"
            text="Essential WTI signals"
          />

          <Plan
            name="VIP"
            price="£24.99"
            text="Advanced signals & history"
            featured
          />

          <Plan
  name="PRO"
  price="£14.99"
  text="Everything you need to follow WTI."
  features={[
    "Live WTI LONG & SHORT signals",
    "Entry, Stop Loss, TP1 & TP2",
    "Signal confidence & score",
    "Live signal status",
    "Recent signal history",
  ]}
/>

<Plan
  name="VIP"
  price="£24.99"
  text="More data. More history. More control."
  features={[
    "Everything in PRO",
    "Full signal history",
    "Advanced performance statistics",
    "Signal filtering & analysis",
    "Priority access to new features",
  ]}
  featured
/>

<Plan
  name="ORACLE"
  price="£39.99"
  text="The complete market intelligence package."
  features={[
    "Everything in VIP",
    "Advanced market intelligence",
    "Extended market context",
    "Premium analytics",
    "Highest level of platform access",
    "Early access to future tools",
  ]}
/>
        </div>

        <p style={styles.founder}>
          EARLY MEMBERS LOCK IN THEIR FOUNDER PRICE.
        </p>
      </section>

      <footer style={styles.footer}>
        <strong>NO BULLSHIT SIGNALS</strong>
        <span>Market intelligence. Nothing mystical.</span>
        <span>© 2026</span>
      </footer>
    </main>
  );
}

function Plan({ name, price, text, features, featured }) {
  return (
    <div
      style={{
        ...styles.plan,
        ...(featured ? styles.featured : {}),
      }}
    >
      {featured && <div style={styles.popular}>MOST POPULAR</div>}

      <h3>{name}</h3>
      <div style={styles.price}>
        {price}
        <small style={styles.month}> / month</small>
      </div>

      <p style={styles.muted}>{text}</p>
        <div style={styles.featureList}>
  {features.map((feature, index) => (
    <div key={index} style={styles.featureItem}>
      <span style={styles.check}>✓</span>
      <span>{feature}</span>
    </div>
  ))}
</div>

      <a
  href="/signup"
  style={featured ? styles.primary : styles.secondary}
>
  START FREE
</a>
    </div>
  );
}

const styles = {
  main: {
    background: "#050807",
    color: "#f4f7f5",
    minHeight: "100vh",
    fontFamily: "Arial, Helvetica, sans-serif",
    scrollBehavior: "smooth",
  },

  nav: {
    height: 75,
    borderBottom: "1px solid #1c2622",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 6%",
  },

  logo: {
    fontWeight: 900,
    letterSpacing: 1,
  },

  green: {
    color: "#37f28b",
  },

  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 30,
    fontSize: 13,
    navLink: {
  color: "#f4f7f5",
  textDecoration: "none",
  cursor: "pointer",
},
  },

  login: {
    background: "transparent",
    border: "1px solid #38423e",
    color: "white",
    padding: "10px 20px",
    borderRadius: 5,
  },

  hero: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "110px 25px 90px",
  },

  badge: {
    color: "#37f28b",
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 25,
  },

  title: {
    fontSize: "clamp(45px, 7vw, 90px)",
    lineHeight: 0.95,
    letterSpacing: -4,
    margin: 0,
    fontWeight: 900,
  },

  subtitle: {
    color: "#9ca8a2",
    fontSize: 19,
    lineHeight: 1.6,
    marginTop: 35,
  },

  buttons: {
    display: "flex",
    gap: 12,
    marginTop: 35,
    flexWrap: "wrap",
  },

  primary: {
  background: "#37f28b",
  color: "#041008",
  border: 0,
  textDecoration: "none",
  display: "inline-block",
    borderRadius: 5,
    padding: "15px 25px",
    fontWeight: 900,
    cursor: "pointer",
  },

  secondary: {
    background: "transparent",
    color: "#f4f7f5",
    border: "1px solid #35413c",
    textDecoration: "none",
display: "inline-block",
    borderRadius: 5,
    padding: "15px 25px",
    fontWeight: 800,
    cursor: "pointer",
  },

  small: {
    color: "#64706b",
    fontSize: 12,
  },

  signalSection: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "40px 25px",
  },

  sectionLabel: {
    color: "#718078",
    letterSpacing: 2,
    fontSize: 11,
    marginBottom: 15,
  },

  signalCard: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 30,
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    gap: 30,
    alignItems: "center",
    flexWrap: "wrap",
  },

  live: {
    color: "#37f28b",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
  },

  dot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#37f28b",
    marginRight: 7,
  },

  wti: {
    marginBottom: 4,
    fontSize: 28,
  },

  muted: {
    color: "#78867f",
  },

  direction: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  long: {
    color: "#37f28b",
  },

  short: {
    color: "#ff5c72",
  },

  confidence: {
    fontSize: 25,
  },

  performance: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "50px 25px",
  },

  table: {
    borderTop: "1px solid #26302c",
  },

  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
    padding: "18px 5px",
    borderBottom: "1px solid #19221e",
    fontSize: 14,
  },

  result: {
    color: "#37f28b",
    textAlign: "right",
  },

  philosophy: {
    maxWidth: 1100,
    margin: "50px auto",
    padding: "50px 25px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
    gap: 15,
  },

  cross: {
    border: "1px solid #302426",
    padding: 20,
    borderRadius: 7,
    color: "#6f7773",
  },

  yes: {
    border: "1px solid #23563b",
    padding: 20,
    borderRadius: 7,
    color: "#37f28b",
  },

  pricing: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "80px 25px",
  },

  pricingTitle: {
    fontSize: "clamp(35px,5vw,60px)",
    marginBottom: 50,
  },

  plans: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
    gap: 15,
  },

  plan: {
    position: "relative",
    border: "1px solid #26322d",
    background: "#080d0b",
    padding: 30,
    borderRadius: 9,
  },

  featured: {
    border: "1px solid #37f28b",
  },

  popular: {
    position: "absolute",
    top: -12,
    right: 15,
    background: "#37f28b",
    color: "#041008",
    padding: "5px 9px",
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 900,
  },

  price: {
    fontSize: 35,
    fontWeight: 900,
    margin: "20px 0",
  },

  month: {
    color: "#75817b",
    fontSize: 12,
  },
featureList: {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  margin: "25px 0 30px",
  minHeight: 150,
},

featureItem: {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  color: "#a6b1ab",
  fontSize: 13,
  lineHeight: 1.5,
},

check: {
  color: "#37f28b",
  fontWeight: 900,
},
  featureList: {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  margin: "25px 0 30px",
  minHeight: 150,
},

featureItem: {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  color: "#a6b1ab",
  fontSize: 13,
  lineHeight: 1.5,
},

check: {
  color: "#37f28b",
  fontWeight: 900,
},
  founder: {
    textAlign: "center",
    color: "#37f28b",
    marginTop: 35,
    fontSize: 12,
    letterSpacing: 1,
  },

  footer: {
    borderTop: "1px solid #1c2622",
    padding: "30px 6%",
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    color: "#65716b",
    fontSize: 12,
    flexWrap: "wrap",
  },
};
