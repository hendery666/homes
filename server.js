// server.js
import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ✅ Initialize Stripe securely
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set. Add it to your .env file (see .env.example).");
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2022-11-15",
});

// ✅ Load environment variables
const FRONTEND_URL = process.env.FRONTEND_URL || "https://homes-beige.vercel.app";

// ✅ Configure CORS (allow both localhost and production)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174", // In case of port conflicts
  "https://homes-beige.vercel.app",
  FRONTEND_URL
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// ✅ Map your Stripe price IDs
const priceMap = {
  "1day": process.env.PRICE_ID_1D,
  "7days": process.env.PRICE_ID_7D,
  "1month": process.env.PRICE_ID_30D,
};

// ✅ Create Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  const { listingId, planId } = req.body;

  if (!listingId || !planId) {
    return res.status(400).json({ error: "Missing listingId or planId" });
  }

  const priceId = priceMap[planId];
  if (!priceId) {
    return res.status(400).json({ error: "Invalid planId" });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // ✅ Dynamic success / cancel URLs for your live frontend
      // Stripe fills in {CHECKOUT_SESSION_ID}; the frontend sends it back to
      // /verify-checkout-session so a boost is only applied after a real payment.
      success_url: `${FRONTEND_URL}/boosting?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/boosting?status=failed`,
      metadata: {
        listingId,
        planId,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Verify a completed Checkout Session before the frontend applies a boost
app.get("/verify-checkout-session", async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Missing session_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      paid: session.payment_status === "paid",
      listingId: session.metadata?.listingId || null,
      planId: session.metadata?.planId || null,
    });
  } catch (err) {
    console.error("❌ Stripe verify error:", err);
    res.status(404).json({ error: "Checkout session not found" });
  }
});

// ✅ Health Check Endpoint (optional for Render)
app.get("/", (req, res) => {
  res.send("✅ Stripe backend is running!");
});

// ✅ Dynamic port for Render
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`🚀 Stripe backend running on port ${PORT}`);
});
