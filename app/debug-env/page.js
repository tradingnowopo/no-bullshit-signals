export default function DebugEnvPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050807",
        color: "white",
        padding: 40,
        fontFamily: "Arial",
      }}
    >
      <h1>ENV DEBUG</h1>

      <p>
        URL exists: <strong>{url ? "YES" : "NO"}</strong>
      </p>

      <p>
        URL value: <strong>{url || "MISSING"}</strong>
      </p>

      <p>
        KEY exists: <strong>{key ? "YES" : "NO"}</strong>
      </p>

      <p>
        KEY starts with sb_publishable_:{" "}
        <strong>{key?.startsWith("sb_publishable_") ? "YES" : "NO"}</strong>
      </p>

      <p>
        KEY length: <strong>{key?.length || 0}</strong>
      </p>
    </main>
  );
}
