// server.js
import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

// initialize Stripe with your secret key from Render environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// --- CORS setup: only allow pay.charmersbiz.org ---
const allowedOrigin = "https://pay.charmersbiz.org";
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow no-origin requests only for internal or health checks
      if (!origin) return callback(null, true);
      if (origin === allowedOrigin) return callback(null, true);
      // reject anything else
      return callback(new Error("Not allowed by CORS policy"), false);
    },
  })
);

// Parse JSON bodies
app.use(express.json());

// health check
app.get("/", (req, res) => {
  res.send("CharmersPay API active and restricted to pay.charmersbiz.org");
});

// --- main endpoint ---
app.post("/create-payment-intent", async (req, res) => {
  try {
    // extra safeguard: verify Host header
    const referer = req.get("origin") || "";
    if (referer !== allowedOrigin) {
      return res.status(403).json({ error: "Forbidden: invalid origin" });
    }

    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Missing amount" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Payment creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Start server ---
app.listen(port, () => {
  console.log(`CharmersPay API running on port ${port}`);
});
