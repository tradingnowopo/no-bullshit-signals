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
  const [historyFilter, setHistoryFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [systemStatus, setSystemStatus] = useState(null);
  const [newsState, setNewsState] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  useEffect(() => {
    loadDashboard();
  }, []);
  useEffect(() => {
  const refreshLiveData = async () => {
    const { data: systemData, error: systemError } = await supabase
      .from("system_status")
      .select("last_tracker_at, symbol, timeframe")
      .eq("id", 1)
      .single();

    if (!systemError && systemData) {
      setSystemStatus(systemData);
    }
    const { data: newsData, error: newsError } = await supabase
  .from("wti_news_state")
  .select(
    "id, event_key, impact, importance, confidence, critical, verified_at, expires_at, updated_at"
  )
  .eq("id", 1)
  .single();

if (!newsError && newsData) {
  setNewsState(newsData);
}

    const { data: signalsData, error: signalsError } = await supabase
      .from("signals")
      .select(
        "id, created_at, instrument, direction, confidence, score, entry_price, timeframe, status, stop_loss, tp1, tp2, result, exit_price, pnl_percent, closed_at, tp2_hit, tp2_hit_at, max_favorable_price"
      )
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!signalsError && signalsData) {
      setSignals(signalsData);
      setLatestSignal(signalsData.length > 0 ? signalsData[0] : null);
    }
  };

  const interval = setInterval(refreshLiveData, 30000);

  return () => clearInterval(interval);
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
  .select(
    "plan, subscription_status, trial_started_at, trial_ends_at, subscription_ends_at, telegram_connected, telegram_username"
  )
  .eq("id", user.id)
  .single();
    if (profileError) {
      console.error("PROFILE ERROR:", profileError);
    }

    const { data: signalsData, error: signalsError } = await supabase
      .from("signals")
      .select(
        "id, created_at, instrument, direction, confidence, score, entry_price, timeframe, status, stop_loss, tp1, tp2, result, exit_price, pnl_percent, closed_at, tp2_hit, tp2_hit_at, max_favorable_price"
      )
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(50);

    if (signalsError) {
      console.error("SIGNALS ERROR:", signalsError);
    }
  const { data: systemStatusData, error: systemStatusError } = await supabase
  .from("system_status")
  .select("last_tracker_at, symbol, timeframe")
  .eq("id", 1)
  .single();

if (systemStatusError) {
  console.error("SYSTEM STATUS ERROR:", systemStatusError);
}

const { data: newsStateData, error: newsStateError } = await supabase
  .from("wti_news_state")
  .select(
    "id, event_key, impact, importance, confidence, critical, verified_at, expires_at, updated_at"
  )
  .eq("id", 1)
  .single();

if (newsStateError) {
  console.error("WTI NEWS STATE ERROR:", newsStateError);
}
    const cleanSignals = signalsData || [];

    setUser(user);
    setProfile(profileData);
    setSignals(cleanSignals);
    setLatestSignal(cleanSignals.length > 0 ? cleanSignals[0] : null);
    setSystemStatus(systemStatusData);
setNewsState(newsStateData);
setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function openBillingPortal() {
    try {
      setPortalLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to open billing portal.");
      }

      if (!data?.url) {
        throw new Error("Portal URL was not returned.");
      }

      window.location.href = data.url;
    } catch (error) {
      console.error("PORTAL ERROR:", error);
      alert(error?.message || "Unable to open subscription portal.");
      setPortalLoading(false);
    }
  }
async function connectTelegram() {
  try {
    setTelegramLoading(true);

    const { data: token, error } = await supabase.rpc(
      "create_telegram_link_token"
    );

    if (error) {
      throw error;
    }

    if (!token) {
      throw new Error("Telegram link token was not returned.");
    }

    const telegramUrl =
      `https://t.me/NoBullshitSignalsbot?start=${encodeURIComponent(token)}`;

    window.location.href = telegramUrl;
  } catch (error) {
    console.error("TELEGRAM CONNECT ERROR:", error);
    alert(error?.message || "Unable to connect Telegram.");
    setTelegramLoading(false);
  }
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

  function resultStyle(result) {
    if (result === "WIN") return styles.win;
    if (result === "LOSS") return styles.loss;
    if (result === "BE") return styles.be;

    return styles.open;
  }
  function getSignalResult(signal) {
  if (!signal) return "OPEN";
  if (signal.result === "VOID_GAP") return "⚪ VOID — MARKET GAP";

  if (signal.result === "LOSS") return "❌ SL HIT";

  if (
    signal.result === "WIN" &&
    signal.tp2_hit &&
    signal.max_favorable_price != null &&
    signal.entry_price != null &&
    signal.tp2 != null
  ) {
    const distanceToTp2 = Math.abs(signal.tp2 - signal.entry_price);
    const runnerThreshold = distanceToTp2 * 0.2;

    if (
      signal.direction === "LONG" &&
      signal.max_favorable_price >= signal.tp2 + runnerThreshold
    ) {
      return "🚀 TP2+";
    }

    if (
      signal.direction === "SHORT" &&
      signal.max_favorable_price <= signal.tp2 - runnerThreshold
    ) {
      return "🚀 TP2+";
    }

    return "✅ TP2 HIT";
  }

  if (signal.result === "WIN") return "✅ TP1 HIT";

  if (signal.result === "BE") return "↔ BREAK EVEN";

  if (signal.result === "AMBIGUOUS") return "⚠️ CHECK";

  return "● OPEN";
}

  const daysLeft = getTrialDaysLeft();
  const trialExpired =
  profile?.subscription_status === "trial" &&
  daysLeft !== null &&
  daysLeft <= 0;

  const trialWarning =
  profile?.subscription_status === "trial" &&
  daysLeft !== null &&
  daysLeft > 0 &&
  daysLeft <= 7;

  const wins = signals.filter((signal) => signal.result === "WIN").length;
  const losses = signals.filter((signal) => signal.result === "LOSS").length;
  const voidGaps = signals.filter(
  (signal) => signal.result === "VOID_GAP"
).length;
  const openSignals = signals.filter(
    (signal) => !signal.result || signal.result === "OPEN"
  ).length;
  const breakEven = signals.filter((signal) => signal.result === "BE").length;

  const completedSignals = wins + losses;

  const winRate =
  completedSignals > 0
    ? Math.round((wins / completedSignals) * 100)
    : 0;

  const hasPaidAccess =
  profile?.subscription_status === "active";
  const currentPlan = String(profile?.plan || "FREE").toUpperCase();

const isPro =
  hasPaidAccess && ["PRO", "VIP", "ORACLE"].includes(currentPlan);

const isVip =
  hasPaidAccess && ["VIP", "ORACLE"].includes(currentPlan);

const isOracle =
  hasPaidAccess && currentPlan === "ORACLE";

  const accessBlocked = trialExpired && !hasPaidAccess;
  const filteredSignals = signals.filter((signal) => {
  if (historyFilter === "ALL") return true;
  if (historyFilter === "LONG") return signal.direction === "LONG";
  if (historyFilter === "SHORT") return signal.direction === "SHORT";
  if (historyFilter === "WIN") return signal.result === "WIN";
  if (historyFilter === "LOSS") return signal.result === "LOSS";
  if (historyFilter === "RUNNER") {
    return getSignalResult(signal) === "🚀 RUNNER";
  }

  return true;
});
  const lastTrackerAt = systemStatus?.last_tracker_at
  ? new Date(systemStatus.last_tracker_at)
  : null;

  const trackerAgeMs = lastTrackerAt
  ? Date.now() - lastTrackerAt.getTime()
  : Infinity;

  const trackerAgeMinutes = Math.floor(trackerAgeMs / 60000);

  const systemOnline = trackerAgeMinutes <= 10;
    const newsExpiresAt = newsState?.expires_at
  ? new Date(newsState.expires_at)
  : null;

const newsActive =
  newsState?.critical === true &&
  newsExpiresAt &&
  newsExpiresAt.getTime() > Date.now();

const newsImpact = String(newsState?.impact || "NEUTRAL").toUpperCase();
  

const newsExpiresMinutes = newsExpiresAt
  ? Math.max(0, Math.floor((newsExpiresAt.getTime() - Date.now()) / 60000))
  : null;

const newsExpiresText =
  newsExpiresMinutes === null
    ? "-"
    : newsExpiresMinutes <= 0
    ? "EXPIRED"
    : newsExpiresMinutes < 60
    ? `${newsExpiresMinutes} MIN`
    : `${Math.floor(newsExpiresMinutes / 60)}H ${newsExpiresMinutes % 60}MIN`;
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
      {trialWarning && (
      <div style={styles.trialWarning}>
      {daysLeft === 1
      ? "⚠️ LAST DAY — Your free trial ends tomorrow."
      : `⚠️ Your free trial ends in ${daysLeft} days. Choose a plan to keep your signals.`}
            </div>
    )}

        <div style={styles.accountGrid}>
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
  {profile?.subscription_status === "active"
    ? profile?.subscription_ends_at
      ? `Active subscription — cancels on ${new Date(
          profile.subscription_ends_at
        ).toLocaleDateString("en-GB")}`
      : "Active paid subscription"
    : profile?.trial_ends_at
    ? `Trial ends: ${new Date(
        profile.trial_ends_at
      ).toLocaleDateString("en-GB")}`
    : "Not available"}
</p>

  {profile?.subscription_status === "active" && (
    <button
      type="button"
      onClick={openBillingPortal}
      disabled={portalLoading}
      style={styles.manageButton}
    >
      {portalLoading
        ? "OPENING STRIPE..."
        : "MANAGE SUBSCRIPTION →"}
    </button>
  )}
{profile?.telegram_connected ? (
  <div style={styles.telegramConnected}>
    ● TELEGRAM CONNECTED
  </div>
) : (
  <button
    type="button"
    onClick={connectTelegram}
    disabled={telegramLoading}
    style={styles.telegramButton}
  >
    {telegramLoading
      ? "CONNECTING..."
      : "CONNECT TELEGRAM →"}
  </button>
)}
</div>
        </div>
{profile?.subscription_status === "trial" && !hasPaidAccess && (
  <div style={styles.paywallCard}>
    <div style={styles.paywallBadge}>FREE TRIAL</div>

    <h2 style={styles.paywallTitle}>
      {daysLeft} DAYS OF FREE ACCESS LEFT
    </h2>

    <p style={styles.paywallText}>
      Enjoy your free trial or choose a plan now to continue your access.
    </p>

    <div style={styles.planGrid}>
  <div style={styles.planCard}>
    <div style={styles.planName}>PRO — £14.99</div>

    <div style={styles.planTagline}>
      WTI SIGNALS
    </div>

    <div style={styles.planDesc}>
      Trade the setup. Skip the noise.
    </div>

    <div style={styles.featureList}>
      <div>✓ WTI LONG & SHORT signals</div>
      <div>✓ Entry, Stop Loss, TP1 & TP2</div>
      <div>✓ Confidence & Signal Score</div>
      <div>✓ Telegram notifications</div>
      <div>✓ Live member dashboard</div>
      <div>✓ Full signal history</div>
      <div>✓ Performance tracking</div>
    </div>

    <a href="/checkout?plan=pro" style={styles.planButton}>
      CHOOSE PRO
    </a>
  </div>

  <div
    style={{
      ...styles.planCard,
      ...styles.vipPlanCard,
    }}
  >
    <div style={styles.popularBadge}>MOST POPULAR</div>

    <div style={styles.planName}>VIP — £24.99</div>

    <div style={styles.planTagline}>
      WTI INTELLIGENCE
    </div>

    <div style={styles.planDesc}>
      Don't just receive the signal. See what's behind the market.
    </div>

    <div style={styles.featureList}>
      <div>✓ Everything in PRO</div>
      <div>✓ Live WTI News Risk</div>
      <div>✓ Bullish / Bearish news impact</div>
      <div>✓ News importance & confidence</div>
      <div>✓ Fundamental market context</div>
      <div>✓ Cross-market confirmation</div>
      <div>✓ Enhanced signal validation</div>
    </div>

    <a href="/checkout?plan=vip" style={styles.planButton}>
      CHOOSE VIP
    </a>
  </div>

  <div
    style={{
      ...styles.planCard,
      ...styles.oraclePlanCard,
    }}
  >
    <div style={styles.oracleBadge}>MAXIMUM PROTECTION</div>

    <div style={styles.planName}>ORACLE — £39.99</div>

    <div style={styles.planTagline}>
      WTI POSITION GUARD
    </div>

    <div style={styles.planDesc}>
      Markets don't stop moving after you enter. Neither does ORACLE.
    </div>

    <div style={styles.featureList}>
      <div>✓ Everything in VIP</div>
      <div>✓ Position Guard</div>
      <div>✓ Active-trade news monitoring</div>
      <div>✓ Critical WTI event alerts</div>
      <div>✓ Risk-change warnings</div>
      <div>✓ Direction-conflict detection</div>
      <div>✓ Protection until TP2 / SL</div>
    </div>

    <a href="/checkout?plan=oracle" style={styles.planButton}>
      CHOOSE ORACLE
    </a>
  </div>
</div>
  </div>
)}
{accessBlocked ? (
  <div style={styles.paywallCard}>
    <div style={styles.paywallBadge}>TRIAL ENDED</div>

    <h2 style={styles.paywallTitle}>
      YOUR FREE ACCESS HAS ENDED
    </h2>

    <p style={styles.paywallText}>
      Choose a plan to continue receiving live WTI signals,
      performance tracking and signal history.
    </p>

    <div style={styles.planGrid}>
  <div style={styles.planCard}>
    <div style={styles.planName}>PRO — £14.99</div>

    <div style={styles.planTagline}>WTI SIGNALS</div>

    <div style={styles.planDesc}>
      Trade the setup. Skip the noise.
    </div>

    <div style={styles.featureList}>
      <div>✓ WTI LONG & SHORT signals</div>
      <div>✓ Entry, Stop Loss, TP1 & TP2</div>
      <div>✓ Confidence & Signal Score</div>
      <div>✓ Telegram notifications</div>
      <div>✓ Live member dashboard</div>
      <div>✓ Full signal history</div>
      <div>✓ Performance tracking</div>
    </div>

    <a href="/checkout?plan=pro" style={styles.planButton}>
      CHOOSE PRO
    </a>
  </div>

  <div
    style={{
      ...styles.planCard,
      ...styles.vipPlanCard,
    }}
  >
    <div style={styles.popularBadge}>MOST POPULAR</div>

    <div style={styles.planName}>VIP — £24.99</div>

    <div style={styles.planTagline}>WTI INTELLIGENCE</div>

    <div style={styles.planDesc}>
      Don't just receive the signal. See what's behind the market.
    </div>

    <div style={styles.featureList}>
      <div>✓ Everything in PRO</div>
      <div>✓ Live WTI News Risk</div>
      <div>✓ Bullish / Bearish news impact</div>
      <div>✓ News importance & confidence</div>
      <div>✓ Fundamental market context</div>
      <div>✓ Cross-market confirmation</div>
      <div>✓ Enhanced signal validation</div>
    </div>

    <a href="/checkout?plan=vip" style={styles.planButton}>
      CHOOSE VIP
    </a>
  </div>

  <div
    style={{
      ...styles.planCard,
      ...styles.oraclePlanCard,
    }}
  >
    <div style={styles.oracleBadge}>MAXIMUM PROTECTION</div>

    <div style={styles.planName}>ORACLE — £39.99</div>

    <div style={styles.planTagline}>WTI POSITION GUARD</div>

    <div style={styles.planDesc}>
      Markets don't stop moving after you enter. Neither does ORACLE.
    </div>

    <div style={styles.featureList}>
      <div>✓ Everything in VIP</div>
      <div>✓ Position Guard</div>
      <div>✓ Active-trade news monitoring</div>
      <div>✓ Critical WTI event alerts</div>
      <div>✓ Risk-change warnings</div>
      <div>✓ Direction-conflict detection</div>
      <div>✓ Protection until TP2 / SL</div>
    </div>

    <a href="/checkout?plan=oracle" style={styles.planButton}>
      CHOOSE ORACLE
    </a>
  </div>
</div>
  </div>
) : (
  <>
  <div style={styles.systemBar}>
  <div>
    <span
      style={{
        ...styles.onlineDot,
        color: systemOnline ? "#37f28b" : "#ff4d5a",
      }}
    >
      ●
    </span>{" "}
    <strong>
      {systemOnline ? "SYSTEM ONLINE" : "DATA OFFLINE"}
    </strong>
  </div>

  <div style={styles.systemInfo}>
    <span>
      {systemStatus?.symbol || "WTI"} ·{" "}
      {systemStatus?.timeframe || "5m"}
    </span>

    <span>
      LAST DATA:{" "}
      {lastTrackerAt
        ? lastTrackerAt.toLocaleString("en-GB")
        : "NO DATA"}
    </span>

    <span>
      {lastTrackerAt
        ? trackerAgeMinutes < 1
          ? "UPDATED: JUST NOW"
          : `UPDATED: ${trackerAgeMinutes} MIN AGO`
        : ""}
    </span>
  </div>
</div>
<div
  style={{
    ...styles.newsRiskBar,
    borderColor: newsActive
      ? newsImpact === "BULLISH"
        ? "#23563b"
        : newsImpact === "BEARISH"
        ? "#5e2930"
        : "#554a29"
      : "#26342e",
  }}
>
  <div>
    <span
  style={{
    ...styles.newsRiskDot,
    color: !newsActive
      ? "#89958f"
      : newsImpact === "BULLISH"
      ? "#37f28b"
      : newsImpact === "BEARISH"
      ? "#ff4d5a"
      : "#f4c95d",
  }}
>
  {newsActive ? "●" : "○"}
</span>{" "}
    <strong>
      {newsActive ? "ACTIVE NEWS RISK" : "NO ACTIVE CRITICAL NEWS"}
    </strong>
  </div>

  <div style={styles.newsRiskInfo}>
    <span>
  IMPACT:{" "}
  <strong
    style={{
      color: !newsActive
        ? "#89958f"
        : newsImpact === "BULLISH"
        ? "#37f28b"
        : newsImpact === "BEARISH"
        ? "#ff4d5a"
        : "#f4c95d",
    }}
  >
    {newsActive ? newsImpact : "NONE"}
  </strong>
</span>

    <span>
      IMPORTANCE: {newsActive ? `${newsState?.importance ?? "-"}/5` : "-"}
    </span>

    <span>
      CONFIDENCE: {newsActive ? `${newsState?.confidence ?? "-"}%` : "-"}
    </span>
      <span>EXPIRES IN: {newsActive ? newsExpiresText : "-"}</span>
  </div>
</div>

{isOracle && (
  <div style={styles.oracleCard}>
    <div style={styles.oracleTop}>
      <div>
        <div style={styles.oracleBadge}>ORACLE ACCESS</div>
        <h2 style={styles.oracleTitle}>POSITION GUARD ACTIVE</h2>
      </div>

      <div style={styles.oracleLive}>● ACTIVE</div>
    </div>

    <p style={styles.oracleText}>
      Advanced WTI monitoring remains active beyond the initial signal.
      ORACLE also shows setups that were detected but deliberately rejected.
    </p>

    <div style={styles.oracleGrid}>
      <div style={styles.oracleFeature}>
        <strong>Rejected Setup Alerts</strong>
        <span>Know when a potential setup is blocked.</span>
      </div>

      <div style={styles.oracleFeature}>
        <strong>Position Guard</strong>
        <span>Active-trade market risk monitoring.</span>
      </div>

      <div style={styles.oracleFeature}>
        <strong>Critical Market Alerts</strong>
        <span>Important WTI market changes while a plan is active.</span>
      </div>

      <div style={styles.oracleFeature}>
        <strong>Direction Conflict</strong>
        <span>Warnings when market conditions turn against the setup.</span>
      </div>
    </div>
  </div>
)}
        {isVip && (
  <>
    <div style={styles.sectionLabel}>PERFORMANCE</div>

    <div style={styles.performanceGrid}>
      <div style={styles.statCard}>
        <div style={styles.label}>WIN RATE</div>
        <div style={styles.greenBig}>{winRate}%</div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.label}>WINS</div>
        <div style={styles.greenBig}>{wins}</div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.label}>LOSSES</div>
        <div style={styles.redBig}>{losses}</div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.label}>OPEN</div>
        <div style={styles.yellowBig}>{openSignals}</div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.label}>BREAK EVEN</div>
        <div style={styles.big}>{breakEven}</div>
      </div>

      <div style={styles.statCard}>
        <div style={styles.label}>VOID / GAP</div>
        <div style={styles.big}>{voidGaps}</div>
      </div>
    </div>
  </>
)}

        
        <div style={styles.sectionLabel}>LATEST ACCEPTED SIGNAL</div>

        <div style={styles.latestCard}>
          {latestSignal ? (
            <>
              <div style={styles.latestTop}>
                <div>
                  <div style={styles.live}>● LATEST SIGNAL</div>

                  <h2 style={styles.wti}>
                    {latestSignal.instrument || "USOIL"}
                  </h2>

                  <p style={styles.muted}>
                    {latestSignal.timeframe || "5m"} ·{" "}
                    {formatDate(latestSignal.created_at)}
                  </p>
                </div>

                <div style={resultStyle(latestSignal.result)}>
                  {getSignalResult(latestSignal)}
                </div>
              </div>

              <div style={styles.signalStats}>
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
                  <div style={styles.label}>STOP LOSS</div>
                  <div style={styles.big}>
                    {latestSignal.stop_loss ?? "-"}
                  </div>
                </div>

                <div>
                  <div style={styles.label}>TP1</div>
                  <div style={styles.big}>{latestSignal.tp1 ?? "-"}</div>
                </div>

                <div>
                  <div style={styles.label}>TP2</div>
                  <div style={styles.big}>{latestSignal.tp2 ?? "-"}</div>
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
              {filteredSignals.length} SIGNAL{filteredSignals.length === 1 ? "" : "S"}
            </div>
          </div>
    <div style={styles.filterBar}>
      {["ALL", "LONG", "SHORT", "WIN", "LOSS", "RUNNER"].map((filter) => (
        <button
          key={filter}
          onClick={() => setHistoryFilter(filter)}
          style={{
        ...styles.filterButton,
        ...(historyFilter === filter ? styles.filterButtonActive : {}),
      }}
    >
      {filter}
    </button>
  ))}
</div>
          {filteredSignals.length > 0 ? (
            <div style={styles.tableWrapper}>
              <div style={styles.table}>
                <div style={styles.tableHeader}>
                  <span>DATE</span>
                  <span>MARKET</span>
                  <span>DIR.</span>
                  <span>ENTRY</span>
                  <span>SL</span>
                  <span>TP1</span>
                  <span>TP2</span>
                  <span>CONF.</span>
                  <span>RESULT</span>
                </div>
          {filteredSignals.map((signal) => (
                  <div style={styles.tableRow} key={signal.id}>
                    <span style={styles.dateCell}>
                      {formatDate(signal.created_at)}
                    </span>

                    <strong>{signal.instrument || "USOIL"}</strong>

                    <strong
                      style={
                        signal.direction === "SHORT"
                          ? styles.shortText
                          : styles.longText
                      }
                    >
                      {signal.direction || "-"}{" "}
                      {signal.direction === "SHORT" ? "↓" : "↑"}
                    </strong>

                    <span>{signal.entry_price ?? "-"}</span>
                    <span>{signal.stop_loss ?? "-"}</span>
                    <span>{signal.tp1 ?? "-"}</span>
                    <span>{signal.tp2 ?? "-"}</span>
                    <span>{signal.confidence ?? "-"}%</span>

                    <span style={resultStyle(signal.result)}>
                      {getSignalResult(signal)}
                    </span>
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

        </>
      )}

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
  trialWarning: {
    marginBottom: 30,
    padding: "14px 16px",
    border: "1px solid #6b5622",
    background: "#171308",
    color: "#f4c95d",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.5,
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
    maxWidth: 1200,
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

  accountGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
    gap: 15,
    marginBottom: 50,
  },
paywallCard: {
  marginTop: 20,
  marginBottom: 50,
  border: "1px solid #26342e",
  background: "#09100d",
  padding: 30,
  borderRadius: 10,
},

paywallBadge: {
  display: "inline-block",
  color: "#ff4d5a",
  border: "1px solid #5e2930",
  padding: "7px 10px",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1.5,
  marginBottom: 18,
},

paywallTitle: {
  fontSize: 30,
  marginTop: 0,
  marginBottom: 12,
},

paywallText: {
  color: "#89958f",
  lineHeight: 1.6,
  maxWidth: 700,
  marginBottom: 25,
},

planGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
  gap: 15,
},

planCard: {
  border: "1px solid #26342e",
  background: "#050807",
  padding: 22,
  borderRadius: 8,
},

planName: {
  color: "#37f28b",
  fontSize: 22,
  fontWeight: 900,
  marginBottom: 8,
},

planDesc: {
  color: "#78867f",
  lineHeight: 1.5,
  minHeight: 45,
  marginBottom: 20,
},
  planTagline: {
  color: "#f4f7f5",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1.5,
  marginBottom: 10,
},

featureList: {
  color: "#aeb8b3",
  fontSize: 12,
  lineHeight: 1.9,
  marginBottom: 22,
  minHeight: 190,
},

vipPlanCard: {
  border: "1px solid #37f28b",
  position: "relative",
},

oraclePlanCard: {
  border: "1px solid #6b5622",
  position: "relative",
},

popularBadge: {
  display: "inline-block",
  color: "#041008",
  background: "#37f28b",
  padding: "5px 8px",
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 1,
  marginBottom: 14,
},

oracleBadge: {
  display: "inline-block",
  color: "#f4c95d",
  border: "1px solid #6b5622",
  padding: "5px 8px",
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: 1,
  marginBottom: 14,
},

planButton: {
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  background: "#37f28b",
  color: "#041008",
  border: 0,
  borderRadius: 5,
  padding: "13px 15px",
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "none",
  textAlign: "center",
},
manageButton: {
  marginTop: 15,
  width: "100%",
  background: "transparent",
  color: "#37f28b",
  border: "1px solid #23563b",
  borderRadius: 5,
  padding: "12px 14px",
  fontWeight: 900,
  fontSize: 11,
  cursor: "pointer",
},
  telegramButton: {
  marginTop: 10,
  width: "100%",
  background: "#229ED9",
  color: "#ffffff",
  border: 0,
  borderRadius: 5,
  padding: "12px 14px",
  fontWeight: 900,
  fontSize: 11,
  cursor: "pointer",
},

telegramConnected: {
  marginTop: 10,
  width: "100%",
  boxSizing: "border-box",
  color: "#37f28b",
  border: "1px solid #23563b",
  background: "#07110c",
  borderRadius: 5,
  padding: "12px 14px",
  fontWeight: 900,
  fontSize: 11,
  textAlign: "center",
},
  oracleCard: {
  border: "1px solid #37f28b",
  background: "#09100d",
  padding: 28,
  borderRadius: 10,
  marginBottom: 45,
},

oracleTop: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 20,
  flexWrap: "wrap",
},

oracleBadge: {
  color: "#37f28b",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1.5,
  marginBottom: 8,
},

oracleTitle: {
  margin: 0,
  fontSize: 25,
},

oracleLive: {
  color: "#37f28b",
  border: "1px solid #23563b",
  padding: "7px 10px",
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 900,
},

oracleText: {
  color: "#89958f",
  lineHeight: 1.6,
  maxWidth: 760,
  margin: "18px 0 24px",
},

oracleGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12,
},

oracleFeature: {
  border: "1px solid #26342e",
  background: "#050807",
  padding: 18,
  borderRadius: 7,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  color: "#f4f7f5",
  fontSize: 13,
},
performanceGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
  gap: 12,
  marginBottom: 55,
},
  

  card: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 25,
    borderRadius: 9,
  },

  statCard: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 20,
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

  yellowBig: {
    color: "#f4c95d",
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

  latestCard: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 30,
    borderRadius: 10,
  },

  latestTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    flexWrap: "wrap",
  },

  signalStats: {
    marginTop: 30,
    paddingTop: 25,
    borderTop: "1px solid #1c2622",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
    gap: 25,
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

  win: {
    display: "inline-block",
    color: "#37f28b",
    border: "1px solid #23563b",
    padding: "7px 10px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 900,
  },

  loss: {
    display: "inline-block",
    color: "#ff4d5a",
    border: "1px solid #5e2930",
    padding: "7px 10px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 900,
  },

  open: {
    display: "inline-block",
    color: "#f4c95d",
    border: "1px solid #554a29",
    padding: "7px 10px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 900,
  },

  be: {
    display: "inline-block",
    color: "#aeb8b3",
    border: "1px solid #35413c",
    padding: "7px 10px",
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 900,
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
  },
filterBar: {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 18,
},

filterButton: {
  background: "transparent",
  color: "#89958f",
  border: "1px solid #26342e",
  borderRadius: 5,
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
},

filterButtonActive: {
  color: "#37f28b",
  border: "1px solid #23563b",
  background: "#07110c",
},
  tableWrapper: {
    overflowX: "auto",
    border: "1px solid #26342e",
    borderRadius: 9,
    background: "#09100d",
  },

  table: {
    minWidth: 1050,
  },

  tableHeader: {
    display: "grid",
    gridTemplateColumns:
      "1.5fr .8fr .8fr .8fr .8fr .8fr .8fr .8fr .8fr",
    gap: 12,
    padding: "15px 20px",
    color: "#65726b",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.1,
    borderBottom: "1px solid #26342e",
  },

  tableRow: {
    display: "grid",
    gridTemplateColumns:
      "1.5fr .8fr .8fr .8fr .8fr .8fr .8fr .8fr .8fr",
    gap: 12,
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
  systemBar: {
  marginBottom: 30,
  padding: "14px 18px",
  border: "1px solid #23563b",
  background: "#07110c",
  borderRadius: 6,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  fontSize: 12,
  letterSpacing: 1,
},

onlineDot: {
  color: "#37f28b",
  marginRight: 5,
},

systemInfo: {
  display: "flex",
  gap: 25,
  color: "#89958f",
  fontSize: 11,
},
  newsRiskBar: {
  marginBottom: 30,
  padding: "14px 18px",
  border: "1px solid #26342e",
  background: "#09100d",
  borderRadius: 6,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  fontSize: 12,
  letterSpacing: 1,
  flexWrap: "wrap",
},

newsRiskDot: {
  color: "#f4c95d",
  marginRight: 5,
},

newsRiskInfo: {
  display: "flex",
  gap: 25,
  color: "#89958f",
  fontSize: 11,
  flexWrap: "wrap",
},
};
