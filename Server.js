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

// Deposit Telegram Handle
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
    const messageText = `💳 *Deposit Request*\n\nFor instant deposit and payment details, please contact our official Deposit Desk directly:\n\n👉 *Telegram:* https://t.me/agsms444\n\nClick the button below to message ${DEPOSIT_TELEGRAM_HANDLE}:`;
    
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

    // Start Flow
    if (text.startsWith('/start')) {
        userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
        await bot.sendMessage(
            chatId, 
            "Hello! Welcome to SMS444. 🎰\n\nPlease reply with your *Full Name* to create an account, or type *deposit* to add funds:", 
            { parse_mode: "Markdown" }
        );
        return;
    }

    // If session doesn't exist yet
    if (!userSessions[chatId]) {
        userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
        await bot.sendMessage(chatId, "Please enter your *Full Name* to start creation (or type *deposit* for deposit info):", { parse_mode: "Markdown" });
        return;
    }

    const session = userSessions[chatId];

    // Registration Step 1: Name
    if (session.step === 'AWAITING_NAME') {
        session.data.fullName = text;
        session.step = 'AWAITING_USERNAME';
        await bot.sendMessage(chatId, `Got it, *${text}*!\n\nNow, enter desired *Username*:`, { parse_mode: "Markdown" });
        return;
    }

    // Registration Step 2: Username
    if (session.step === 'AWAITING_USERNAME') {
        session.data.username = text.replace(/\s+/g, '');
        session.step = 'AWAITING_PHONE';
        await bot.sendMessage(chatId, `Username: \`${session.data.username}\`\n\nFinally, enter *Mobile Number*:`, { parse_mode: "Markdown" });
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
                    `🎉 *Account Created Successfully!*\n\n🌐 *URL:* https://sms444.com\n👤 *Username:* \`${session.data.username}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n⚠️ Log in and change password immediately.\n\n💳 *For Deposit:* Type *deposit* or click below to contact ${DEPOSIT_TELEGRAM_HANDLE}`,
                    {
                        parse_mode: "Markdown",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "💳 Deposit Now (@agsms444)",
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
        
