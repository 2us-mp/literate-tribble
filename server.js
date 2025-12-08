const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const cors = require("cors");
const Stripe = require("stripe");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (if needed)
app.use(express.static("public"));

// Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ===============================
// Disk Storage (Completed Orders Only)
// ===============================
const ORDERS_FILE = path.join(__dirname, "orders.json");

// Ensure file exists
if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([]));
}

function loadOrders() {
    return JSON.parse(fs.readFileSync(ORDERS_FILE));
}

function saveOrders(orders) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ===============================
// Sessions (for login)
// ===============================
app.use(
    session({
        secret: process.env.SESSION_SECRET || "fallback-secret",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false } // Render = false
    })
);

// ===============================
// Login Page (Plain Text)
// ===============================
app.get("/login", (req, res) => {
    res.send(`
Login Required
------------------------

<form method="POST" action="/login">
Username:
<input name="username" required>

Password:
<input type="password" name="password" required>

<button type="submit">Login</button>
</form>
`);
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASSWORD
    ) {
        req.session.isAdmin = true;
        return res.redirect("/dashboard");
    }

    res.send("Invalid login.");
});

// Auth middleware
function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) return res.redirect("/login");
    next();
}

// ===============================
// Stripe PaymentIntent (Your code preserved)
// ===============================
app.post("/create-payment-intent", async (req, res) => {
    try {
        const { amount, currency = "usd", orderDetails, customerInfo, shipping } = req.body;

        if (!amount || amount < 50) {
            return res.status(400).json({
                error: "Invalid amount. Minimum charge is $0.50"
            });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            automatic_payment_methods: { enabled: true },
            metadata: {
                orderType: orderDetails?.braceletType || "unknown",
                customerName: customerInfo?.name || "Unknown",
                email: customerInfo?.email || "Unknown"
            }
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });

    } catch (error) {
        console.error("Error creating PaymentIntent:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===============================
// Save Completed Order (Only final step)
// ===============================
app.post("/save-order", async (req, res) => {
    try {
        const { paymentIntentId, status = "completed", customerInfo, orderDetails, shipping, amount } = req.body;

        if (!paymentIntentId) {
            return res.status(400).json({ error: "Missing paymentIntentId" });
        }

        const orders = loadOrders();

        const order = {
            id: `order_${Date.now()}`,
            paymentIntentId,
            status,
            amount,
            customerInfo: customerInfo || {},
            orderDetails: orderDetails || {},
            shipping: shipping || {},
            createdAt: new Date().toISOString()
        };

        orders.push(order);
        saveOrders(orders);

        res.json({
            success: true,
            orderId: order.id
        });

    } catch (error) {
        console.error("Error saving order:", error);
        res.status(500).json({ error: error.message });
    }
});

// ===============================
// Dashboard (Plain Text)
// ===============================
app.get("/dashboard", requireAdmin, (req, res) => {
    const orders = loadOrders();

    let html = `
Charmers Order Dashboard
--------------------------

Total Completed Orders: ${orders.length}

<a href="/logout">Logout</a>

<br><br>

<table border="1" cellpadding="5">
<tr>
  <th>Order ID</th>
  <th>Name</th>
  <th>Email</th>
  <th>Amount</th>
  <th>Status</th>
  <th>Timestamp</th>
</tr>
`;

    orders.forEach(o => {
        html += `
<tr>
  <td>${o.id}</td>
  <td>${o.customerInfo?.name || "N/A"}</td>
  <td>${o.customerInfo?.email || "N/A"}</td>
  <td>$${o.amount}</td>
  <td>${o.status}</td>
  <td>${o.createdAt}</td>
</tr>
`;
    });

    html += "</table>";

    res.send(html);
});

// Logout
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
});

// ===============================
// Health
// ===============================
app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "Charmers Payment API" });
});

// ===============================
// Root
// ===============================
app.get("/", (req, res) => {
    res.send("Charmers Backend Running.");
});

// ===============================
// Start
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Charmers backend running on port ${PORT}`);
});
