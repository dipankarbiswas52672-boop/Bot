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

// Master Account Credentials
const AGENT_USERNAME = process.env.AGENT_USERNAME || "Bro090";
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "Sourav123";
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

// Target Server Configuration
const SERVER_IP = "43.204.42.19";
const DOMAIN = "ag.sms444.com";
const BASE_URL = `https://${SERVER_IP}`;

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN environment variable missing!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Memory Store for User Registration Steps
const userSessions = {};

// Common Headers for Target Server
const getBaseHeaders = () => ({
    'Host': DOMAIN,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': `https://${DOMAIN}`,
    'Referer': `https://${DOMAIN}/`
});

// Step 1: Login to Master Account & Get Fresh Bearer Token
async function getMasterAuthToken() {
    try {
        console.log("Logging into Master Account...");
        const response = await axios.post(
            `${BASE_URL}/ag/exchange/login`,
            {
                username: AGENT_USERNAME,
                password: AGENT_PASSWORD
            },
            {
                headers: getBaseHeaders(),
                rejectUnauthorized: false
            }
        );

        const token = response.data.token || response.data.access_token || response.data.data?.token || response.data.result?.token;
        
        if (!token) {
            console.error("Login Response Payload:", JSON.stringify(response.data));
            throw new Error("Token missing in login response");
        }
        
        return token;
    } catch (err) {
        console.error("Master Login Error:", err.response?.data || err.message);
        throw new Error(err.response?.data?.meta?.message || "Master Account Login Failed");
    }
}

// Step 2: Create User Account via API
async function createAccountAPI(userData, token) {
    try {
        console.log(`Creating account for ${userData.username}...`);
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

        const response = await axios.post(
            `${BASE_URL}/ag/exchange/account/createAccount`,
            payload,
            {
                headers: {
                    ...getBaseHeaders(),
                    'Authorization': `Bearer ${token}`
                },
                rejectUnauthorized: false
            }
        );

        if (response.data && response.data.meta && response.data.meta.status) {
            return { success: true, response: response.data };
        } else {
            return { success: false, message: response.data?.meta?.message || "Creation failed" };
        }
    } catch (err) {
        console.error("Create Account API Error:", err.response?.data || err.message);
        return { 
            success: false, 
            message: err.response?.data?.meta?.message || err.response?.data?.message || err.message 
        };
    }
}

// Telegram Message Processing
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    if (!text) return;

    // Reset Flow on /start
    if (text.startsWith('/start')) {
        userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
        await bot.sendMessage(
            chatId, 
            "Hello! Welcome to SMS444. 🎰\n\nI will help you create your account right away.\n\nPlease reply with your *Full Name*:", 
            { parse_mode: "Markdown" }
        );
        return;
    }

    // Initialize session if missing
    if (!userSessions[chatId]) {
        userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
        await bot.sendMessage(chatId, "Welcome! Please enter your *Full Name* to start creation:", { parse_mode: "Markdown" });
        return;
    }

    const session = userSessions[chatId];

    // Step 1: Collect Name
    if (session.step === 'AWAITING_NAME') {
        session.data.fullName = text;
        session.step = 'AWAITING_USERNAME';
        await bot.sendMessage(chatId, `Got it, *${text}*!\n\nNow, please enter your desired *Username*:`, { parse_mode: "Markdown" });
        return;
    }

    // Step 2: Collect Username
    if (session.step === 'AWAITING_USERNAME') {
        const cleanUsername = text.replace(/\s+/g, '');
        session.data.username = cleanUsername;
        session.step = 'AWAITING_PHONE';
        await bot.sendMessage(chatId, `Username set to \`${cleanUsername}\`.\n\nFinally, please provide your *Mobile Number*:`, { parse_mode: "Markdown" });
        return;
    }

    // Step 3: Collect Phone & Submit API
    if (session.step === 'AWAITING_PHONE') {
        session.data.phone = text;
        session.step = 'PROCESSING';

        await bot.sendMessage(chatId, "Authenticating Master Account & Creating ID... ⏳");

        try {
            const token = await getMasterAuthToken();
            const createResult = await createAccountAPI(session.data, token);

            if (createResult.success) {
                await bot.sendMessage(
                    chatId,
                    `🎉 *Account Created Successfully!*\n\n🌐 *URL:* https://sms444.com\n👤 *Username:* \`${session.data.username}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n⚠️ *Important:* Log in and change your password immediately.`,
                    { parse_mode: "Markdown" }
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
                `❌ *Process Error:* ${error.message}. Type /start to try again.`
            );
        }

        delete userSessions[chatId];
    }
});
