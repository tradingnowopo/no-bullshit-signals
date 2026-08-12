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

    const { data: signalData, error: signalError } = await supabase
      .from("signals")
      .select(
        "id, created_at, instrument, direction, confidence, score, entry_price, timeframe, status"
      )
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (signalError) {
      console.error("SIGNAL ERROR:", signalError);
    }

    setUser(user);
    setProfile(profileData);
    setLatestSignal(signalData);
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
                ? new Date(profile.trial_ends_at).toLocaleDateString()
                : "Not available"}
            </p>
          </div>
        </div>

        <div style={styles.signalCard}>
          {latestSignal ? (
            <>
              <div>
                <div style={styles.live}>● LATEST SIGNAL</div>

                <h2 style={styles.wti}>
                  {latestSignal.instrument || "USOIL"}
                </h2>

                <p style={styles.muted}>
                  Timeframe: {latestSignal.timeframe || "5m"}
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
    marginBottom: 25,
  },

  card: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 25,
    borderRadius: 9,
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

  loading: {
    padding: 50,
    color: "#37f28b",
    fontWeight: 900,
  },
};
