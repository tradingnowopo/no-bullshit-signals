"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <a href="/" style={styles.logo}>
          NO <span style={styles.green}>BULLSHIT</span> SIGNALS
        </a>

        <div style={styles.badge}>MEMBER ACCESS</div>

        <h1 style={styles.title}>LOG IN</h1>

        <p style={styles.subtitle}>
          Access your WTI market signals and account.
        </p>

        <form onSubmit={handleLogin} style={styles.form}>
          <label style={styles.label}>EMAIL</label>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            style={styles.input}
          />

          <label style={styles.label}>PASSWORD</label>

          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            style={styles.input}
          />

          <button disabled={loading} type="submit" style={styles.button}>
            {loading ? "LOGGING IN..." : "LOG IN →"}
          </button>
        </form>

        {message && <div style={styles.message}>{message}</div>}

        <p style={styles.signupText}>
          Don't have an account?{" "}
          <a href="/signup" style={styles.signupLink}>
            START 14 DAYS FREE
          </a>
        </p>
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
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "30px 20px",
  },

  card: {
    width: "100%",
    maxWidth: 480,
    background: "#09100d",
    border: "1px solid #26342e",
    borderRadius: 12,
    padding: "40px",
    boxSizing: "border-box",
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
    marginTop: 45,
    color: "#37f28b",
    border: "1px solid #23563b",
    borderRadius: 4,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.5,
  },

  title: {
    fontSize: 38,
    lineHeight: 1,
    marginTop: 20,
    marginBottom: 15,
  },

  subtitle: {
    color: "#89958f",
    lineHeight: 1.6,
    marginBottom: 30,
  },

  form: {
    display: "flex",
    flexDirection: "column",
  },

  label: {
    color: "#78867f",
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: 800,
    marginBottom: 8,
    marginTop: 15,
  },

  input: {
    background: "#050807",
    color: "#ffffff",
    border: "1px solid #35413c",
    borderRadius: 5,
    padding: "15px",
    fontSize: 15,
    outline: "none",
  },

  button: {
    marginTop: 25,
    background: "#37f28b",
    color: "#041008",
    border: 0,
    borderRadius: 5,
    padding: "16px",
    fontWeight: 900,
    cursor: "pointer",
  },

  message: {
    marginTop: 20,
    background: "#101915",
    border: "1px solid #26342e",
    borderRadius: 5,
    padding: 14,
    color: "#b8c5be",
    fontSize: 13,
    lineHeight: 1.5,
  },

  signupText: {
    textAlign: "center",
    color: "#7b8982",
    marginTop: 25,
    fontSize: 13,
  },

  signupLink: {
    color: "#37f28b",
    fontWeight: 900,
    textDecoration: "none",
  },
};
