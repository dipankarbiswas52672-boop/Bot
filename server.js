const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// --- CONFIGURATION SETUP ---
const VERIFY_TOKEN = "my_secret_token_123";

// System User Permanent Token (Never Expire)
const WHATSAPP_TOKEN = "EAAbE0VRxwHsBSuuuf4dOuYYWpmENILl2gXc2HUX3JiVE1CRNFrBwq0bjZAxfezztq7PxIEbZBr6uaZBGhevCGm5liEW8Lco7bWziIT7rd2Y4SGZBalaYXWl8T9ktbDQXzxGZBCGZAbCIZCntHabaGxPNEhvl6ddiA2GRPiVbNeGTfF1pIFZBR6VLMWeDSr9DTwZDZD";
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

        console.log(`Received message from ${from}: ${text}`);

        // Step 1: Start Conversation
        if (!userSessions[from]) {
            userSessions[from] = { step: 1 };
            await sendWhatsAppMessage(from, "Welcome to SMS444 Auto Account Setup! 🎲\n\nPlease enter your *Full Name*:");
            return;
        }

        const session = userSessions[from];

        // Step 2: Receive Name
        if (session.step === 1) {
            session.name = text;
            session.step = 2;
            await sendWhatsAppMessage(from, `Thanks ${text}!\n\nNow enter your preferred *Username* (only letters & numbers):`);
        } 
        // Step 3: Receive Username
        else if (session.step === 2) {
            session.username = text;
            session.step = 3;
            await sendWhatsAppMessage(from, "Got it! Now enter your *10-digit Mobile Number*:");
        } 
        // Step 4: Receive Mobile Number & Execute Automation
        else if (session.step === 3) {
            session.phone = text;
            session.step = 4;
            
            // Auto generate password
            session.userPassword = "Pass@" + Math.floor(1000 + Math.random() * 9000);

            await sendWhatsAppMessage(from, "Creating your account on ag.sms444.com, please wait a few seconds... ⌛");

            // Puppeteer Automation Call
            const success = await createCasinoAccount(session);

            if (success) {
                await sendWhatsAppMessage(from, `🎉 *Account Created Successfully!*\n\n🌐 *Website:* https://sms444.com\n👤 *Username:* ${session.username}\n🔑 *Password:* ${session.userPassword}\n\nPlease change your password after your first login!`);
            } else {
                await sendWhatsAppMessage(from, "❌ Sorry, account creation failed automatically. Please check details or contact support.");
            }

            delete userSessions[from]; // Reset session
        }
    } catch (err) {
        console.error("Webhook error:", err);
    }
});

// Helper Function: Send Message via WhatsApp Graph API
async function sendWhatsAppMessage(to, text) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
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
        console.log("WhatsApp message sent successfully:", response.data);
    } catch (error) {
        console.error("WhatsApp Send Error:", error.response?.data || error.message);
    }
}

// Helper Function: Puppeteer Browser Automation
async function createCasinoAccount(userData) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(AGENT_LOGIN_URL, { waitUntil: 'networkidle2' });

        // 1. Login to Agent Panel
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

        // 4. Submit Form
        await page.click('button:has-text("Create")');
        await new Promise(r => setTimeout(r, 4000));

        await browser.close();
        return true;

    } catch (error) {
        console.error("Puppeteer Automation Error:", error);
        if (browser) await browser.close();
        return false;
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server live on port ${PORT}`);
});
          
