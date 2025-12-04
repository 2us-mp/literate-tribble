const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve HTML dashboard

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// In-memory storage (replace with database in production)
let orders = [];

// Create PaymentIntent AND save order
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { 
            amount, 
            currency = 'usd', 
            orderDetails, // New: Order details from frontend
            customerInfo 
        } = req.body;

        // Validate
        if (!amount || amount < 50) {
            return res.status(400).json({ 
                error: 'Invalid amount. Minimum charge is $0.50' 
            });
        }

        if (!orderDetails) {
            return res.status(400).json({ 
                error: 'Order details required' 
            });
        }

        // Create PaymentIntent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            automatic_payment_methods: { enabled: true },
            metadata: {
                orderType: orderDetails.braceletType,
                customerName: customerInfo?.name || 'Unknown',
                email: customerInfo?.email || 'Unknown',
                timestamp: new Date().toISOString()
            }
        });

        // Save order details (will be completed after webhook)
        const order = {
            id: paymentIntent.id,
            amount: amount / 100, // Convert cents to dollars
            status: 'pending',
            paymentIntentId: paymentIntent.id,
            customerInfo: customerInfo || {},
            orderDetails: orderDetails,
            shipping: orderDetails.shipping || {},
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        orders.push(order);

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            orderId: order.id
        });

    } catch (error) {
        console.error('Error creating PaymentIntent:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook to update order status
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'payment_intent.succeeded':
            const paymentIntent = event.data.object;
            
            // Update order status
            const orderIndex = orders.findIndex(o => o.paymentIntentId === paymentIntent.id);
            if (orderIndex !== -1) {
                orders[orderIndex].status = 'completed';
                orders[orderIndex].completedAt = new Date().toISOString();
                orders[orderIndex].stripePaymentId = paymentIntent.id;
                
                console.log(`✅ Order completed: ${paymentIntent.id}`);
                console.log(`Customer: ${orders[orderIndex].customerInfo.name}`);
                console.log(`Amount: $${orders[orderIndex].amount}`);
            }
            break;

        case 'payment_intent.payment_failed':
            const failedPayment = event.data.object;
            const failedOrderIndex = orders.findIndex(o => o.paymentIntentId === failedPayment.id);
            if (failedOrderIndex !== -1) {
                orders[failedOrderIndex].status = 'failed';
                console.log(`❌ Payment failed: ${failedPayment.id}`);
            }
            break;
    }

    res.json({ received: true });
});

// Save order directly (fallback if webhook fails)
app.post('/save-order', async (req, res) => {
    try {
        const { 
            paymentIntentId, 
            status = 'completed',
            customerInfo,
            orderDetails,
            shipping 
        } = req.body;

        // Check if order already exists
        let orderIndex = orders.findIndex(o => o.paymentIntentId === paymentIntentId);
        
        if (orderIndex === -1) {
            // Create new order
            const order = {
                id: `order_${Date.now()}`,
                paymentIntentId: paymentIntentId,
                status: status,
                amount: orderDetails?.total || 0,
                customerInfo: customerInfo || {},
                orderDetails: orderDetails || {},
                shipping: shipping || {},
                createdAt: new Date().toISOString(),
                completedAt: status === 'completed' ? new Date().toISOString() : null
            };
            
            orders.push(order);
            orderIndex = orders.length - 1;
        } else {
            // Update existing order
            orders[orderIndex].status = status;
            orders[orderIndex].completedAt = status === 'completed' ? new Date().toISOString() : null;
            
            if (customerInfo) orders[orderIndex].customerInfo = customerInfo;
            if (orderDetails) orders[orderIndex].orderDetails = orderDetails;
            if (shipping) orders[orderIndex].shipping = shipping;
        }

        console.log(`📦 Order saved: ${orders[orderIndex].id}`);
        res.json({ 
            success: true, 
            orderId: orders[orderIndex].id,
            message: 'Order saved successfully'
        });

    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all orders (for dashboard)
app.get('/api/orders', (req, res) => {
    try {
        // Filter only completed orders
        const completedOrders = orders.filter(order => order.status === 'completed');
        
        // Sort by most recent
        completedOrders.sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt));
        
        res.json({
            success: true,
            count: completedOrders.length,
            orders: completedOrders
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single order
app.get('/api/orders/:id', (req, res) => {
    try {
        const order = orders.find(o => o.id === req.params.id || o.paymentIntentId === req.params.id);
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        res.json({ success: true, order });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        service: 'Charmers Payment API',
        ordersCount: orders.length,
        completedOrders: orders.filter(o => o.status === 'completed').length
    });
});

// Serve dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(__dirname + '/public/dashboard.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Charmers backend running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`💳 Payment endpoint: http://localhost:${PORT}/create-payment-intent`);
    console.log(`📦 Orders endpoint: http://localhost:${PORT}/api/orders`);
});
