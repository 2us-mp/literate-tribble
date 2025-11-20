// server.js
import express from "express";
import Stripe from "stripe";

const app = express();
const port = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Completely remove CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// Parse JSON
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("CharmersPay API active — CORS disabled");
});

// PaymentIntent route
app.post("/create-payment-intent", async (req, res) => {
  try {
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

// Start server
app.listen(port, () =>
  console.log(`CharmersPay API running on port ${port} with NO CORS`)
);
