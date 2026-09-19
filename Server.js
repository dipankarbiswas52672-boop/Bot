const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// --- CONFIGURATION SETUP ---
const VERIFY_TOKEN = "my_secret_token_123";
const WHATSAPP_TOKEN = "EAAbE0VRxwHsBSvSYs6ZCWfsqJY5DDb3Jmgvyxu1SUgfYQvcR70HvmhRJfSaXEem9fvkv4YbEE2ZAvEIgBxfw2b8JNY4lryQfXVRPZB0xjssFu78g6nlkwEWE9QNxbO21LsY7RTRy0UwlLs6bjWJPYXKehmzfKQzKUIMcSBCCQDYn6Wl0fHaWbmZAhqZCjO4EcHw2ZCClFUwRuVCLkaGaqz20NmalfBBWYa";
const PHONE_NUMBER_ID = "1232695343270561";

// Agent Site Credentials
const AGENT_LOGIN_URL = "https://ag.sms444.com/";
const AGENT_USERNAME = "Bro090";
const AGENT_PASSWORD = "Sourav123";
const MASTER_PASSWORD = "Sourav123";

// User Session State Tracking
const userSessions = {};

// Webhook Verification Endpoint
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Incoming WhatsApp Webhook Endpoint
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);

    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (!message || message.type !== 'text') return;

        const from = message.from;
        const text = message.text.body.trim();

        if (!userSessions[from]) {
            userSessions[from] = { step: 1 };
            await sendWhatsAppMessage(from, "Welcome to SMS444 Auto Account Setup!\n\nPlease enter your **Full Name**:");
            return;
        }

        const session = userSessions[from];

        if (session.step === 1) {
            session.name = text;
            session.step = 2;
            await sendWhatsAppMessage(from, `Thanks ${text}!\n\nNow enter your preferred **Username** (letters and numbers only):`);
        } else if (session.step === 2) {
            session.username = text;
            session.step = 3;
            await sendWhatsAppMessage(from, "Got it! Now enter your **10-digit Mobile Number**:");
        } else if (session.step === 3) {
            session.phone = text;
            session.step = 4;
            
            // Generate Random Password
            session.userPassword = "Pass@" + Math.floor(1000 + Math.random() * 9000);

            await sendWhatsAppMessage(from, "Creating your account on ag.sms444.com, please wait a few seconds...");

            // Run Puppeteer Automation
            const success = await createCasinoAccount(session);

            if (success) {
                await sendWhatsAppMessage(from, `🎉 *Account Created Successfully!*\n\n🌐 **Website:** https://sms444.com\n👤 **Username:** ${session.username}\n🔑 **Password:** ${session.userPassword}\n\nPlease change your password after logging in!`);
            } else {
                await sendWhatsAppMessage(from, "❌ Sorry, failed to create account automatically. Please try again later or contact support.");
            }

            delete userSessions[from]; // Clear Session
        }
    } catch (err) {
        console.error("Webhook processing error:", err);
    }
});

// Send WhatsApp Text via Graph API
async function sendWhatsAppMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error("WhatsApp Send Error:", error.response?.data || error.message);
    }
}

// Puppeteer Account Creation Logic
async function createCasinoAccount(userData) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(AGENT_LOGIN_URL, { waitUntil: 'networkidle2' });

        // 1. Login Phase
        await page.waitForSelector('input[placeholder="Username"]');
        await page.type('input[placeholder="Username"]', AGENT_USERNAME);
        await page.type('input[placeholder="Password"]', AGENT_PASSWORD);
        
        await Promise.all([
            page.click('button[type="submit"], button:has-text("Login")'),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);

        // 2. Open Add User Modal
        await page.waitForSelector('button:has-text("Add User"), .btn:has-text("Add User")', { timeout: 15000 });
        await page.click('button:has-text("Add User"), .btn:has-text("Add User")');

        // 3. Fill Form Fields
        await page.waitForSelector('input[placeholder="Username.."]', { timeout: 10000 });

        await page.type('input[placeholder="Username.."]', userData.username);
        await page.type('input[placeholder="Name.."]', userData.name);
        await page.type('input[placeholder="Commission.."]', '0');
        await page.type('input[placeholder="Opening Balance.."]', '0');
        await page.type('input[placeholder="Exposure Limit"]', '0');
        await page.type('input[placeholder="Credit Reference.."]', '0');
        await page.type('input[placeholder="Mobile Number.."]', userData.phone);
        await page.type('input[placeholder="Password.."]', userData.userPassword);
        await page.type('input[placeholder="Confirm Password.."]', userData.userPassword);
        await page.type('input[placeholder="Master Password.."]', MASTER_PASSWORD);

        // 4. Submit Creation
        await page.click('button:has-text("Create")');
        await new Promise(r => setTimeout(r, 4000));

        await browser.close();
        return true;

    } catch (error) {
        console.error("Puppeteer Automation Failure:", error);
        if (browser) await browser.close();
        return false;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server live on port ${PORT}`);
});
              
