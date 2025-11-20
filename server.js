// server.js
import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// allow your domain + Safari iOS
const allowedOrigin = "https://pay.charmersbiz.org";

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // iOS Safari fix
      if (origin === allowedOrigin) return callback(null, true);
      return callback(new Error("CORS blocked"), false);
    },
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("CharmersPay API active");
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    // Safari fix: only block wrong origins, not null origins
    const origin = req.get("origin");
    if (origin && origin !== allowedOrigin) {
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

app.listen(port, () =>
  console.log(`CharmersPay API running on port ${port}`)
);
