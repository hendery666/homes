// server.js
import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ✅ Initialize Stripe securely
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
      success_url: `${FRONTEND_URL}/boosting?status=success&plan=${planId}&listing=${listingId}`,
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

// ✅ Health Check Endpoint (optional for Render)
app.get("/", (req, res) => {
  res.send("✅ Stripe backend is running!");
});

// ✅ Dynamic port for Render
const PORT = process.env.PORT || 4242;
app.listen(PORT, () => {
  console.log(`🚀 Stripe backend running on port ${PORT}`);
});
