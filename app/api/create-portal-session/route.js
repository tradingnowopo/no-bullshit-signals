
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("PROFILE ERROR:", profileError);
      return Response.json(
        { error: "Could not load subscription profile." },
        { status: 500 }
      );
    }

    if (!profile?.stripe_customer_id) {
      return Response.json(
        { error: "No Stripe customer found for this account." },
        { status: 400 }
      );
    }

    const origin =
      request.headers.get("origin") ||
      "https://no-bullshit-signals.vercel.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    });

    return Response.json({
      url: portalSession.url,
    });
  } catch (error) {
    console.error("PORTAL SESSION ERROR:", error);

    return Response.json(
      { error: error?.message || "Unable to open customer portal." },
      { status: 500 }
    );
  }
}
