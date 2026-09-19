const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

// CONFIGURATION
const VERIFY_TOKEN = "my_secret_token_123"; // Meta Webhook-e exact aita bosabe
const WHATSAPP_TOKEN = "YOUR_META_TEMPORARY_ACCESS_TOKEN"; // Meta Dashboard theke anbe
const PHONE_NUMBER_ID = "1232695343270561"; // Meta Dashboard-er Phone ID

// Temporary memory to track user conversation state
const userSessions = {};

// 1. Meta Webhook Verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Incoming Messages & Conversation Logic
app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (message && message.type === 'text') {
            const from = message.from; // User Phone Number
            const text = message.text.body.trim();

            if (!userSessions[from]) {
                userSessions[from] = { step: 'ASK_NAME' };
                await sendWhatsAppMsg(from, "Hello Sir! Welcome. Apnar Full Name-ta bolun:");
            } 
            else if (userSessions[from].step === 'ASK_NAME') {
                userSessions[from].fullName = text;
                userSessions[from].step = 'ASK_USERNAME';
                await sendWhatsAppMsg(from, `Dhonnobad, ${text}! Akhon apnar pochondomoto ekti Username bolun:`);
            } 
            else if (userSessions[from].step === 'ASK_USERNAME') {
                userSessions[from].username = text;
                userSessions[from].step = 'ASK_PHONE';
                await sendWhatsAppMsg(from, "Abar apnar Phone Number-ti diyen:");
            } 
            else if (userSessions[from].step === 'ASK_PHONE') {
                userSessions[from].phone = text;
                await sendWhatsAppMsg(from, "Dhonnobad! Apnar account toiri hocche, ektu somoy din...");

                // Execute Browser Automation
                const { fullName, username, phone } = userSessions[from];
                const newAcc = await createCasinoIdOnWebsite(fullName, username, phone);

                if (newAcc.success) {
                    await sendWhatsAppMsg(from, `🎉 Congratulations! Apnar ID ready:\n\n👤 Username: ${username}\n🔑 Password: ${newAcc.password}\n🌐 Link: https://ag.sms444.com`);
                } else {
                    await sendWhatsAppMsg(from, "❌ Account create korte somossha hoyeche. Doya kore pore abar chesta korun.");
                }

                delete userSessions[from]; // Session reset
            }
        }
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

// 3. WhatsApp Message Send Function
async function sendWhatsAppMsg(to, message) {
    await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
        headers: {
            "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
        },
        data: {
            messaging_product: "whatsapp",
            to: to,
            type: "text",
            text: { body: message }
        }
    });
}

// 4. Web Automation Script for ag.sms444.com
async function createCasinoIdOnWebsite(fullName, username, phone) {
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();

        // Step A: Login Master Account
        await page.goto('https://ag.sms444.com', { waitUntil: 'networkidle2' });
        
        // **Note:** Exact input field selector gulo website dekhe replace korte hobe
        await page.type('input[name="username"]', 'sourav121'); 
        await page.type('input[name="password"]', 'Abcd1234'); 
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // Step B: Navigate & Fill New User Form
        await page.goto('https://ag.sms444.com/agent/create-user', { waitUntil: 'networkidle2' });
        await page.type('input[name="fullname"]', fullName);
        await page.type('input[name="user_name"]', username);
        await page.type('input[name="mobile"]', phone);
        
        const autoPassword = "Pass" + Math.floor(1000 + Math.random() * 9000);
        await page.type('input[name="user_password"]', autoPassword);

        await page.click('#submit-btn'); // Submit button
        await page.waitForTimeout(3000);

        await browser.close();
        return { success: true, password: autoPassword };
    } catch (error) {
        console.error("Automation Error:", error);
        if (browser) await browser.close();
        return { success: false };
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
          
