import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseServerClient } from "@/lib/auth/supabase-server";
import { isLocalMode } from "@/lib/environment";
import { getCreditLimitByPriceId } from "@/lib/stripe-config";
import { upsertSubscriptionFromPrice } from "@/lib/db/users";

type SessionCreateParams = Stripe.Checkout.SessionCreateParams;

// Initialize Stripe lazily only in External Mode

export async function POST(request: Request) {
  try {
    const { priceId, userId, customerEmail } = await request.json();

    console.log("Checkout session request:", {
      priceId,
      userId,
      customerEmail,
    });

    if (!priceId || !userId || !customerEmail) {
      console.error("Missing required parameters:", {
        priceId,
        userId,
        customerEmail,
      });
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    // Local Mode: mock checkout session and auto-"webhook" behavior
    if (isLocalMode()) {
      const sessionId = `sess_local_${Math.random().toString(36).slice(2, 10)}`;
      // Immediately grant credits and set subscription as active
      const credits = getCreditLimitByPriceId(priceId);
      await upsertSubscriptionFromPrice(userId, priceId, credits, customerEmail);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      console.log("[LOCAL_MODE] Mock checkout created and applied:", { userId, priceId, credits, sessionId });
      // Return a sessionId so the UI can follow the same flow (redirect step will be a no-op in local)
      return NextResponse.json({ sessionId, successUrl: `${baseUrl}/success?session_id=${sessionId}` });
    }

    // Verify Stripe is initialized
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY is not set");
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 500 },
      );
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Get or create Stripe customer
    let customerId: string;

    // Check if user already has a Stripe customer ID
  const supabaseServer = getSupabaseServerClient();
  const { data: userData, error: userError } = await supabaseServer
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", userId)
      .single();

    if (userError && userError.code !== "PGRST116") {
      console.error("Error fetching user:", userError);
      return NextResponse.json(
        { error: "Failed to fetch user data" },
        { status: 500 },
      );
    }

    if (userData?.stripe_customer_id) {
      customerId = userData.stripe_customer_id as string;
      console.log("Using existing Stripe customer:", customerId);
    } else {
      // Create a new customer
      console.log("Creating new Stripe customer for:", customerEmail);
      const customer = await stripe.customers.create({
        email: customerEmail,
        metadata: {
          userId,
        },
      });

      customerId = customer.id;
      console.log("Created new Stripe customer:", customerId);

      // Create or update user record in Supabase
      const { error: updateError } = await supabaseServer.from("users").upsert(
        {
          id: userId,
          email: customerEmail,
          stripe_customer_id: customerId,
          credits_available: 0,
          subscription_status: "inactive",
        },
        {
          onConflict: "id",
        },
      );

      if (updateError) {
        console.error("Error creating/updating user record:", updateError);
        // Don't fail the checkout, but log the error
      }
    }

    // Create a checkout session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const sessionParams: SessionCreateParams = {
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        userId,
      },
      subscription_data: {
        metadata: {
          userId,
        },
      },
    };

  const session = await stripe.checkout.sessions.create(sessionParams);

  return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
