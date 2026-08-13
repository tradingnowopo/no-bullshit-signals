"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const plans = {
  pro: {
    name: "PRO",
    price: "£14.99",
    description: "Core WTI signal access.",
    features: [
      "Live LONG & SHORT WTI signals",
      "Entry, Stop Loss, TP1 & TP2",
      "Confidence & score",
      "Recent signal history",
    ],
  },

  vip: {
    name: "VIP",
    price: "£24.99",
    description: "Advanced access with deeper history and analytics.",
    features: [
      "Everything in PRO",
      "Full signal history",
      "Advanced performance statistics",
      "Signal filtering & analysis",
    ],
  },

  oracle: {
    name: "ORACLE",
    price: "£39.99",
    description: "Full premium platform access.",
    features: [
      "Everything in VIP",
      "Advanced market intelligence",
      "Premium analytics",
      "Early access to future tools",
    ],
  },
};

function CheckoutContent() {
  const searchParams = useSearchParams();

  const requestedPlan = String(
    searchParams.get("plan") || "pro"
  ).toLowerCase();

  const planKey = plans[requestedPlan] ? requestedPlan : "pro";
  const plan = plans[planKey];

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function startCheckout() {
    try {
      setLoading(true);
      setMessage("");

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        window.location.href =
          `/login?next=${encodeURIComponent(`/checkout?plan=${planKey}`)}`;
        return;
      }

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan: planKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href =
            `/login?next=${encodeURIComponent(`/checkout?plan=${planKey}`)}`;
          return;
        }

        throw new Error(data?.error || "Unable to start checkout.");
      }

      if (!data?.url) {
        throw new Error("Stripe checkout URL was not returned.");
      }

      window.location.href = data.url;
    } catch (error) {
      console.error("CHECKOUT ERROR:", error);
      setMessage(
        error?.message || "Unable to start checkout. Please try again."
      );
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <a href="/" style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </a>

        <div style={styles.badge}>SECURE CHECKOUT</div>

        <h1 style={styles.title}>CHOOSE YOUR ACCESS</h1>

        <p style={styles.subtitle}>
          You selected the {plan.name} plan.
        </p>

        <div style={styles.card}>
          <div style={styles.planName}>{plan.name}</div>

          <div style={styles.price}>
            {plan.price}
            <span style={styles.month}> / month</span>
          </div>

          <p style={styles.description}>{plan.description}</p>

          <div style={styles.features}>
            {plan.features.map((feature, index) => (
              <div key={index} style={styles.feature}>
                <span style={styles.check}>✓</span>
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={startCheckout}
            disabled={loading}
            style={{
              ...styles.payButton,
              ...(loading ? styles.payButtonDisabled : {}),
            }}
          >
            {loading
              ? "OPENING SECURE CHECKOUT..."
              : `CONTINUE WITH ${plan.name} →`}
          </button>

          <p style={styles.small}>
            Payment is processed securely by Stripe.
          </p>

          {message && (
            <div style={styles.message}>
              {message}
            </div>
          )}

          <a href="/dashboard" style={styles.back}>
            ← BACK TO DASHBOARD
          </a>
        </div>
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.main}>
          <div style={styles.container}>
            <div style={styles.badge}>CHECKOUT</div>
            <h1 style={styles.title}>LOADING CHECKOUT...</h1>
          </div>
        </main>
      }
    >
      <CheckoutContent />
    </Suspense>
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
    maxWidth: 700,
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
    padding: "6px 10px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.5,
  },

  title: {
    fontSize: "clamp(38px,6vw,60px)",
    marginBottom: 10,
  },

  subtitle: {
    color: "#89958f",
    marginBottom: 30,
  },

  card: {
    border: "1px solid #26342e",
    background: "#09100d",
    padding: 30,
    borderRadius: 10,
  },

  planName: {
    color: "#37f28b",
    fontSize: 28,
    fontWeight: 900,
  },

  price: {
    fontSize: 42,
    fontWeight: 900,
    marginTop: 15,
  },

  month: {
    color: "#78867f",
    fontSize: 13,
  },

  description: {
    color: "#9ca8a2",
    lineHeight: 1.6,
    marginBottom: 25,
  },

  features: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 30,
  },

  feature: {
    display: "flex",
    gap: 10,
    color: "#b0bbb5",
    fontSize: 14,
  },

  check: {
    color: "#37f28b",
    fontWeight: 900,
  },

  payButton: {
    width: "100%",
    background: "#37f28b",
    color: "#041008",
    border: 0,
    borderRadius: 5,
    padding: "16px 20px",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 14,
  },

  payButtonDisabled: {
    opacity: 0.6,
    cursor: "wait",
  },

  small: {
    color: "#65726b",
    fontSize: 12,
    textAlign: "center",
    marginTop: 15,
  },

  message: {
    marginTop: 20,
    background: "#171308",
    border: "1px solid #6b5622",
    color: "#f4c95d",
    padding: 14,
    borderRadius: 5,
    fontSize: 13,
    lineHeight: 1.5,
  },

  back: {
    display: "inline-block",
    marginTop: 25,
    color: "#37f28b",
    textDecoration: "none",
    fontWeight: 900,
    fontSize: 12,
  },
};
