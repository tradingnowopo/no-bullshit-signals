
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing Stripe signature", { status: 400 });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("WEBHOOK SIGNATURE ERROR:", error.message);

      return new Response(`Webhook Error: ${error.message}`, {
        status: 400,
      });
    }

    // ---------------------------------------
    // CHECKOUT COMPLETED
    // ---------------------------------------

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const userId = session.metadata?.user_id;
      const plan = session.metadata?.plan?.toUpperCase();

      if (!userId) {
        console.error("Missing user_id in Stripe metadata");
        return new Response("Missing user_id", { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          subscription_status: "active",
          plan: plan || "PRO",
          stripe_customer_id: session.customer || null,
          stripe_subscription_id: session.subscription || null,
        })
        .eq("id", userId);

      if (error) {
        console.error("SUPABASE UPDATE ERROR:", error);
        return new Response("Supabase update failed", { status: 500 });
      }

      console.log("SUBSCRIPTION ACTIVATED:", userId, plan);
    }

    // ---------------------------------------
    // SUBSCRIPTION UPDATED
    // ---------------------------------------

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;

      const stripeSubscriptionId = subscription.id;

      const activeStatuses = ["active", "trialing"];

      const newStatus = activeStatuses.includes(subscription.status)
        ? "active"
        : subscription.status;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          subscription_status: newStatus,
        })
        .eq("stripe_subscription_id", stripeSubscriptionId);

      if (error) {
        console.error("SUBSCRIPTION UPDATE ERROR:", error);
        return new Response("Subscription update failed", { status: 500 });
      }
    }

    // ---------------------------------------
    // SUBSCRIPTION CANCELLED
    // ---------------------------------------

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({
          subscription_status: "cancelled",
        })
        .eq("stripe_subscription_id", subscription.id);

      if (error) {
        console.error("SUBSCRIPTION DELETE ERROR:", error);
        return new Response("Subscription cancellation failed", {
          status: 500,
        });
      }
    }

    // ---------------------------------------
    // PAYMENT FAILED
    // ---------------------------------------

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;

      const subscriptionId =
        invoice.parent?.subscription_details?.subscription ||
        invoice.subscription ||
        null;

      if (subscriptionId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: "past_due",
          })
          .eq("stripe_subscription_id", subscriptionId);

        if (error) {
          console.error("PAYMENT FAILED UPDATE ERROR:", error);
          return new Response("Payment status update failed", {
            status: 500,
          });
        }
      }
    }

    return Response.json({
      received: true,
    });
  } catch (error) {
    console.error("STRIPE WEBHOOK ERROR:", error);

    return new Response("Webhook processing failed", {
      status: 500,
    });
  }
}
