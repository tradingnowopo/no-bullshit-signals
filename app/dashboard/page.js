"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [latestSignal, setLatestSignal] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("plan, subscription_status, trial_started_at, trial_ends_at")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("PROFILE ERROR:", profileError);
    }

    const { data: signalsData, error: signalsError } = await supabase
      .from("signals")
      .select(
        "id, created_at, instrument, direction, confidence, score, entry_price, timeframe, status"
      )
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(20);

    if (signalsError) {
      console.error("SIGNALS ERROR:", signalsError);
    }

    const cleanSignals = signalsData || [];

    setUser(user);
    setProfile(profileData);
    setSignals(cleanSignals);
    setLatestSignal(cleanSignals.length > 0 ? cleanSignals[0] : null);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function getTrialDaysLeft() {
    if (!profile?.trial_ends_at) return 0;

    const now = new Date();
    const end = new Date(profile.trial_ends_at);
    const diff = end.getTime() - now.getTime();

    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function formatDate(date) {
    if (!date) return "-";

    return new Date(date).toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const daysLeft = getTrialDaysLeft();

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.loading}>LOADING MEMBER AREA...</div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <div style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </div>

        <button onClick={logout} style={styles.logout}>
          LOG OUT
        </button>
      </nav>

      <section style={styles.wrapper}>
        <div style={styles.badge}>MEMBER AREA</div>

        <h1 style={styles.title}>YOUR DASHBOARD</h1>

        <p style={styles.email}>{user?.email}</p>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>ACCESS STATUS</div>

            <div style={styles.greenBig}>
              {profile?.subscription_status === "trial"
                ? "FREE TRIAL"
                : profile?.subscription_status?.toUpperCase() || "UNKNOWN"}
            </div>

            <p style={styles.muted}>
              {profile?.subscription_status === "trial"
                ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`
                : "Subscription access"}
            </p>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>CURRENT PLAN</div>

            <div style={styles.big}>{profile?.plan || "FREE"}</div>

            <p style={styles.muted}>
              Trial ends:{" "}
              {profile?.trial_ends_at
                ? new Date(profile.trial_ends_at).toLocaleDateString("en-GB")
                : "Not available"}
            </p>
          </div>
        </div>

        <div style={styles.sectionLabel}>LATEST ACCEPTED SIGNAL</div>

        <div style={styles.signalCard}>
          {latestSignal ? (
            <>
              <div>
                <div style={styles.live}>● LIVE / LATEST</div>

                <h2 style={styles.wti}>
                  {latestSignal.instrument || "USOIL"}
                </h2>

                <p style={styles.muted}>
                  {latestSignal.timeframe || "5m"} ·{" "}
                  {formatDate(latestSignal.created_at)}
                </p>
              </div>

              <div>
                <div style={styles.label}>DIRECTION</div>

                <div
                  style={
                    latestSignal.direction === "SHORT"
                      ? styles.redBig
                      : styles.greenBig
                  }
                >
                  {latestSignal.direction || "-"}{" "}
                  {latestSignal.direction === "LONG"
                    ? "↑"
                    : latestSignal.direction === "SHORT"
                    ? "↓"
                    : ""}
                </div>
              </div>

              <div>
                <div style={styles.label}>ENTRY</div>
                <div style={styles.big}>
                  {latestSignal.entry_price ?? "-"}
                </div>
              </div>

              <div>
                <div style={styles.label}>CONFIDENCE</div>
                <div style={styles.big}>
                  {latestSignal.confidence ?? "-"}%
                </div>
              </div>

              <div>
                <div style={styles.label}>SCORE</div>
                <div style={styles.big}>
                  {latestSignal.score ?? "-"}/100
                </div>
              </div>
            </>
          ) : (
            <div>
              <div style={styles.live}>● LATEST SIGNAL</div>
              <h2 style={styles.wti}>NO SIGNAL YET</h2>
              <p style={styles.muted}>
                Waiting for the next accepted WTI signal.
              </p>
            </div>
          )}
        </div>

        <section style={styles.historySection}>
          <div style={styles.historyHeader}>
            <div>
              <div style={styles.sectionLabel}>SIGNAL HISTORY</div>
              <h2 style={styles.historyTitle}>RECENT SIGNALS</h2>
            </div>

            <div style={styles.signalCount}>
              {signals.length} SIGNAL{signals.length === 1 ? "" : "S"}
            </div>
          </div>

          {signals.length > 0 ? (
            <div style={styles.tableWrapper}>
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <span>DATE</span>
                  <span>MARKET</span>
                  <span>TF</span>
                  <span>DIRECTION</span>
                  <span>ENTRY</span>
                  <span>CONF.</span>
                  <span>SCORE</span>
                </div>

                {signals.map((signal) => (
                  <div style={styles.tableRow} key={signal.id}>
                    <span style={styles.dateCell}>
                      {formatDate(signal.created_at)}
                    </span>

                    <strong>{signal.instrument || "USOIL"}</strong>

                    <span>{signal.timeframe || "-"}</span>

                    <strong
                      style={
                        signal.direction === "SHORT"
                          ? styles.shortText
                          : styles.longText
                      }
                    >
                      {signal.direction}{" "}
                      {signal.direction === "SHORT" ? "↓" : "↑"}
                    </strong>

                    <span>{signal.entry_price ?? "-"}</span>

                    <span>{signal.confidence ?? "-"}%</span>

                    <strong>{signal.score ?? "-"}/100</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={styles.emptyHistory}>
              No accepted signals in history yet.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: "100vh",
    background: "#050807",
    color: "#f4f7f5",
    fontFamily: "Arial, Helvetica, sans-serif",
  },

  nav: {
    height: 75,
    borderBottom: "1px solid #1c2622",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 6%",
  },

  logo: {
    fontWeight: 900,
    letterSpacing: 1,
  },

  green: {
    color: "#37f28b",
  },

  logout: {
    background: "transparent",
    color: "white",
    border: "1px solid #35413c",
    padding: "10px 18px",
    borderRadius: 5,
    cursor: "pointer",
  },

  wrapper: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "70px 25px",
  },

  badge: {
    color: "#37f28b",
    fontSize: 12,
    letterSpacing: 2,
  },

  title: {
    fontSize: "clamp(40px,6vw,70px)",
    marginBottom: 5,
  },

  email: {
    color: "#75817b",
    marginBottom: 40,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
    gap: 15,
    marginBottom: 45,
  },

  card: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 25,
    borderRadius: 9,
  },

  sectionLabel: {
    color: "#718078",
    fontSize: 11,
    letterSpacing: 1.7,
    marginBottom: 12,
  },

  label: {
    color: "#718078",
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
  },

  greenBig: {
    color: "#37f28b",
    fontSize: 24,
    fontWeight: 900,
  },

  redBig: {
    color: "#ff4d5a",
    fontSize: 24,
    fontWeight: 900,
  },

  big: {
    fontSize: 24,
    fontWeight: 900,
  },

  muted: {
    color: "#78867f",
    lineHeight: 1.5,
  },

  signalCard: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 30,
    borderRadius: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 30,
    flexWrap: "wrap",
  },

  live: {
    color: "#37f28b",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
  },

  wti: {
    fontSize: 28,
    marginBottom: 5,
  },

  historySection: {
    marginTop: 70,
    paddingBottom: 80,
  },

  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 20,
    marginBottom: 20,
  },

  historyTitle: {
    fontSize: 30,
    margin: 0,
  },

  signalCount: {
    color: "#37f28b",
    border: "1px solid #23563b",
    padding: "8px 12px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
  },

  tableWrapper: {
    overflowX: "auto",
    border: "1px solid #26342e",
    borderRadius: 9,
    background: "#09100d",
  },

  table: {
    minWidth: 850,
  },

  tableHeader: {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr .6fr 1fr 1fr .8fr .8fr",
    gap: 15,
    padding: "15px 20px",
    color: "#65726b",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.3,
    borderBottom: "1px solid #26342e",
  },

  tableRow: {
    display: "grid",
    gridTemplateColumns: "1.5fr 1fr .6fr 1fr 1fr .8fr .8fr",
    gap: 15,
    padding: "18px 20px",
    alignItems: "center",
    borderBottom: "1px solid #18211d",
    fontSize: 13,
  },

  dateCell: {
    color: "#7d8983",
  },

  longText: {
    color: "#37f28b",
  },

  shortText: {
    color: "#ff4d5a",
  },

  emptyHistory: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 30,
    borderRadius: 9,
    color: "#78867f",
  },

  loading: {
    padding: 50,
    color: "#37f28b",
    fontWeight: 900,
  },
};
