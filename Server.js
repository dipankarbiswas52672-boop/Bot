const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// Express Server for Render Keep-Alive
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SMS444 Agent Bot Active'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Environment Variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const AGENT_USERNAME = process.env.AGENT_USERNAME || "Bro090";
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "Sourav123";
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

// Render Environment Variables-e MASTER_BEARER_TOKEN set kora thakle fallback hisebe kaj korbe
const HARDCODED_MASTER_TOKEN = process.env.MASTER_BEARER_TOKEN || "";

const SERVER_IP = "43.204.42.19";
const DOMAIN = "ag.sms444.com";
const BASE_URL = `https://${SERVER_IP}`;

// Telegram Handles
const DEPOSIT_TELEGRAM_HANDLE = "@agsms444";

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN environment variable missing!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userSessions = {};

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    rejectUnauthorized: false
});

// Build Headers
const getHeaders = (token = null) => {
    const headers = {
        'Host': DOMAIN,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': `https://${DOMAIN}`,
        'Referer': `https://${DOMAIN}/`
    };

    if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    return headers;
};

// Master Auth Token Fetcher
async function getMasterAuthToken() {
    try {
        console.log("Attempting Master Account Login...");
        await api.get('/ag/', { headers: getHeaders() }).catch(() => {});

        const response = await api.post(
            '/ag/exchange/login',
            {
                username: AGENT_USERNAME,
                password: AGENT_PASSWORD
            },
            { headers: getHeaders() }
        );

        let token = response.headers['authorization'] || 
                    response.headers['x-auth-token'] || 
                    response.headers['token'];

        if (!token && response.data) {
            token = response.data.token || 
                    response.data.access_token || 
                    response.data.data?.token || 
                    response.data.result?.token;
        }

        if (token) {
            console.log("Master Authorization Token Acquired via API!");
            return token.replace(/^Bearer\s+/i, '');
        }
    } catch (err) {
        console.warn("Live Login Failed:", err.response?.data || err.message);
    }

    if (HARDCODED_MASTER_TOKEN) {
        console.log("Using Fallback MASTER_BEARER_TOKEN from Environment Variables...");
        return HARDCODED_MASTER_TOKEN.replace(/^Bearer\s+/i, '');
    }

    throw new Error("Master Login failed and no MASTER_BEARER_TOKEN configured.");
}

// Create Account API Call
async function createAccountAPI(userData, token) {
    try {
        console.log(`Sending Create Account Request for: ${userData.username}`);

        const payload = {
            userName: userData.username,
            name: userData.fullName,
            password: DEFAULT_USER_PASSWORD,
            confirmPassword: DEFAULT_USER_PASSWORD,
            bankBalance: "0",
            level: "7",
            commission: "0",
            exposureLimit: 5000,
            creditReference: "0",
            mobileNo: userData.phone,
            partnership: "100",
            rollingFancyCommission: 0,
            rollingCasinoCommission: 0,
            rollingBinaryCommission: 0,
            rollingSportsbookCommission: 0,
            rollingBookmakerCommission: 0,
            rollingVirtualSportsCommission: 0,
            rollingMatkaCommission: 0,
            rollingLinemarketCommission: 0,
            masterPassword: MASTER_PASSWORD
        };

        const response = await api.post(
            '/ag/exchange/account/createAccount',
            payload,
            { headers: getHeaders(token) }
        );

        if (response.data && response.data.meta && response.data.meta.status) {
            return { success: true, response: response.data };
        } else {
            return { 
                success: false, 
                message: response.data?.meta?.message || "Server rejected account creation." 
            };
        }
    } catch (err) {
        console.error("Create Account Error:", err.response?.data || err.message);
        return { 
            success: false, 
            message: err.response?.data?.meta?.message || err.response?.data?.message || err.message 
        };
    }
}

// Deposit Redirect Helper
async function sendDepositRedirect(chatId) {
    const messageText = `💳 *Deposit & Payment Desk*\n\nFor instant deposit, bonus claims, and payment details, please contact our official Deposit Desk directly:\n\n👉 *Telegram:* https://t.me/agsms444\n\nClick the button below to message ${DEPOSIT_TELEGRAM_HANDLE}:`;
    
    await bot.sendMessage(chatId, messageText, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "💬 Contact Deposit Desk (@agsms444)",
                        url: "https://t.me/agsms444"
                    }
                ]
            ]
        }
    });
}

// Send Main Welcome Menu with Offers
async function sendStartMenu(chatId, firstName = "") {
    const welcomeMsg = `🔥 *Welcome to SMS444 Official Bot!* ${firstName ? `Hello *${firstName}*! ` : ''}🎰

🎁 *TODAY'S SPECIAL OFFER:*
💸 *100% Loss Refund Guarantee!*
- Play your favorite games today.
- Get instant Loss Refund back on your deposits!
- Fast payouts & 24/7 Support.

👇 *Choose an option below to get started:*`;

    await bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "👤 Create New Account", callback_data: "START_REGISTER" },
                    { text: "💳 Deposit / Add Funds", url: "https://t.me/agsms444" }
                ],
                [
                    { text: "🔥 Today's Loss Refund Details", callback_data: "SHOW_OFFER" },
                    { text: "💬 Live Support (@agsms444)", url: "https://t.me/agsms444" }
                ]
            ]
        }
    });
}

// Handle Inline Keyboard Callbacks (Button Clicks)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    if (action === 'START_REGISTER') {
        userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
        await bot.sendMessage(chatId, "👤 *Account Creation Wizard*\n\nPlease reply with your *Full Name* to start registration:", { parse_mode: "Markdown" });
    } else if (action === 'SHOW_OFFER') {
        const offerDetails = `🎁 *TODAY'S LOSS REFUND OFFER DETAILS:*

✨ *Offer Highlights:*
• 💯 *100% Loss Cashback/Refund* on your first deposit games!
• ⚡ Fast Instant Processing via Deposit Desk.
• 🔒 Safe & Secure Betting Platform.

👉 *How to Claim:*
1. Create an account here.
2. Contact Deposit Desk: https://t.me/agsms444
3. Mention code: \`LOSS-REFUND-444\``;

        await bot.sendMessage(chatId, offerDetails, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "💳 Claim Offer & Deposit Now", url: "https://t.me/agsms444" },
                        { text: "👤 Create Account", callback_data: "START_REGISTER" }
                    ]
                ]
            }
        });
    }
});

// Telegram Message Handling
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    if (!text) return;

    const lowerText = text.toLowerCase();

    // Check for Deposit Keywords or /deposit command
    if (lowerText === 'deposit' || lowerText === 'depo' || lowerText === 'ডিপোজিট' || lowerText === '/deposit') {
        await sendDepositRedirect(chatId);
        return;
    }

    // Check for Offer Keywords
    if (lowerText.includes('offer') || lowerText.includes('loss') || lowerText.includes('refund') || lowerText.includes('অফার')) {
        await bot.sendMessage(chatId, `🎁 *Today's Special Offer:* 100% Loss Refund Available!\n\nContact Deposit Desk to claim: https://t.me/agsms444`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[{ text: "💬 Contact Deposit Desk", url: "https://t.me/agsms444" }]]
            }
        });
        return;
    }

    // Start Command
    if (text.startsWith('/start')) {
        delete userSessions[chatId];
        await sendStartMenu(chatId, msg.from?.first_name || "");
        return;
    }

    // Registration Session Flow
    const session = userSessions[chatId];

    if (!session) {
        // Default fallthrough if not registering
        await sendStartMenu(chatId, msg.from?.first_name || "");
        return;
    }

    // Registration Step 1: Name
    if (session.step === 'AWAITING_NAME') {
        session.data.fullName = text;
        session.step = 'AWAITING_USERNAME';
        await bot.sendMessage(chatId, `Got it, *${text}*!\n\nNow, enter your desired *Username*:`, { parse_mode: "Markdown" });
        return;
    }

    // Registration Step 2: Username
    if (session.step === 'AWAITING_USERNAME') {
        session.data.username = text.replace(/\s+/g, '');
        session.step = 'AWAITING_PHONE';
        await bot.sendMessage(chatId, `Username: \`${session.data.username}\`\n\nFinally, enter your *Mobile Number*:`, { parse_mode: "Markdown" });
        return;
    }

    // Registration Step 3: Phone & Submit
    if (session.step === 'AWAITING_PHONE') {
        session.data.phone = text;
        session.step = 'PROCESSING';

        await bot.sendMessage(chatId, "🔐 Authorizing Master Token & Creating Account...");

        try {
            const token = await getMasterAuthToken();
            const createResult = await createAccountAPI(session.data, token);

            if (createResult.success) {
                await bot.sendMessage(
                    chatId,
                    `🎉 *Account Created Successfully!*\n\n🌐 *URL:* https://sms444.com\n👤 *Username:* \`${session.data.username}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n⚠️ Log in and change your password immediately.\n\n🎁 *Today's Offer:* Get 100% Loss Refund on your first Deposit!\n💳 *Deposit Handle:* ${DEPOSIT_TELEGRAM_HANDLE}`,
                    {
                        parse_mode: "Markdown",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "💳 Claim Loss Refund & Deposit Now",
                                        url: "https://t.me/agsms444"
                                    }
                                ]
                            ]
                        }
                    }
                );
            } else {
                await bot.sendMessage(
                    chatId,
                    `❌ *Account Creation Failed*\n*Reason:* ${createResult.message}\n\nType /start to try again.`
                );
            }
        } catch (error) {
            await bot.sendMessage(
                chatId,
                `❌ *Process Error:* ${error.message}\n\nType /start to try again.`
            );
        }

        delete userSessions[chatId];
    }
});
