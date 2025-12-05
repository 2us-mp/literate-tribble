const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Stripe
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// In-memory storage
let orders = [];

// Create PaymentIntent
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'usd', orderDetails, customerInfo, shipping } = req.body;

        if (!amount || amount < 50) {
            return res.status(400).json({ 
                error: 'Invalid amount. Minimum charge is $0.50' 
            });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: currency,
            automatic_payment_methods: { enabled: true },
            metadata: {
                orderType: orderDetails?.braceletType || 'unknown',
                customerName: customerInfo?.name || 'Unknown',
                email: customerInfo?.email || 'Unknown'
            }
        });

        // Save order
        const order = {
            id: paymentIntent.id,
            amount: amount / 100,
            status: 'pending',
            paymentIntentId: paymentIntent.id,
            customerInfo: customerInfo || {},
            orderDetails: orderDetails || {},
            shipping: shipping || {},
            createdAt: new Date().toISOString()
        };

        orders.push(order);

        res.json({
            clientSecret: paymentIntent.clientSecret,
            paymentIntentId: paymentIntent.id,
            orderId: order.id
        });

    } catch (error) {
        console.error('Error creating PaymentIntent:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save order
app.post('/save-order', async (req, res) => {
    try {
        const { paymentIntentId, status = 'completed', customerInfo, orderDetails, shipping, amount } = req.body;

        let orderIndex = orders.findIndex(o => o.paymentIntentId === paymentIntentId);
        
        if (orderIndex === -1) {
            const order = {
                id: `order_${Date.now()}`,
                paymentIntentId: paymentIntentId,
                status: status,
                amount: amount || 0,
                customerInfo: customerInfo || {},
                orderDetails: orderDetails || {},
                shipping: shipping || {},
                createdAt: new Date().toISOString(),
                completedAt: status === 'completed' ? new Date().toISOString() : null
            };
            
            orders.push(order);
            orderIndex = orders.length - 1;
        } else {
            orders[orderIndex].status = status;
            orders[orderIndex].completedAt = status === 'completed' ? new Date().toISOString() : null;
            
            if (customerInfo) orders[orderIndex].customerInfo = customerInfo;
            if (orderDetails) orders[orderIndex].orderDetails = orderDetails;
            if (shipping) orders[orderIndex].shipping = shipping;
            if (amount) orders[orderIndex].amount = amount;
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

// Get all orders
app.get('/api/orders', (req, res) => {
    try {
        const completedOrders = orders.filter(order => order.status === 'completed');
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

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Charmers Backend API',
        endpoints: {
            health: '/health',
            createPaymentIntent: '/create-payment-intent',
            saveOrder: '/save-order',
            orders: '/api/orders',
            dashboard: '/dashboard'
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction ? 
        `https://pay-charmersv2.onrender.com` : 
        `http://localhost:${PORT}`;
    
    console.log(`🚀 Charmers backend running`);
    console.log(`🌐 Base URL: ${baseUrl}`);
    console.log(`📊 Dashboard: ${baseUrl}/dashboard`);
    console.log(`💳 Create PaymentIntent: ${baseUrl}/create-payment-intent`);
    console.log(`📦 Save Order: ${baseUrl}/save-order`);
    console.log(`📋 Health check: ${baseUrl}/health`);
    console.log(`🔧 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
});
