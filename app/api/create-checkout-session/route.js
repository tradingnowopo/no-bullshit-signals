
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

const priceByPlan = {
  pro: process.env.STRIPE_PRICE_PRO,
  vip: process.env.STRIPE_PRICE_VIP,
  oracle: process.env.STRIPE_PRICE_ORACLE,
};

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return Response.json(
        { error: "Invalid or expired session" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const plan = String(body?.plan || "").toLowerCase();
    const priceId = priceByPlan[plan];

    if (!priceId) {
      return Response.json(
        { error: "Invalid plan" },
        { status: 400 }
      );
    }

    const origin =
      request.headers.get("origin") ||
      "https://no-bullshit-signals.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      customer_email: user.email,
      client_reference_id: user.id,

      metadata: {
        user_id: user.id,
        plan: plan.toUpperCase(),
      },

      subscription_data: {
        metadata: {
          user_id: user.id,
          plan: plan.toUpperCase(),
        },
      },

      success_url:
        `${origin}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${origin}/checkout?plan=${plan}&payment=cancelled`,
    });

    return Response.json({
      url: session.url,
    });
  } catch (error) {
    console.error("STRIPE CHECKOUT ERROR:", error);

    return Response.json(
      { error: "Unable to create checkout session" },
      { status: 500 }
    );
  }
}
