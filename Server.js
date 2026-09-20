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

// Custom Axios Instance with SSL Ignore & Cookie Persistence
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    rejectUnauthorized: false
});

// Standard Browsing Headers
const getHeaders = (token = null, cookie = null) => {
    const headers = {
        'Host': DOMAIN,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': `https://${DOMAIN}`,
        'Referer': `https://${DOMAIN}/`
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['token'] = token;
    }

    if (cookie) {
        headers['Cookie'] = cookie;
    }

    return headers;
};

// Step 1: Master Login & Bearer Token Retrieval
async function getMasterAuthToken() {
    try {
        console.log("Step 1: Initializing session with target server...");
        
        // 1.1 First request to establish initial session/cookies
        let initResponse;
        try {
            initResponse = await api.get('/ag/', {
                headers: getHeaders()
            });
        } catch (e) {
            // Ignore landing page errors if API endpoints respond
        }

        // Extract Cookies if returned
        let sessionCookie = "";
        if (initResponse && initResponse.headers['set-cookie']) {
            sessionCookie = initResponse.headers['set-cookie'].join('; ');
        }

        console.log("Step 2: Sending Agent Login Credentials...");
        
        // 1.2 Send Login POST Request
        const loginResponse = await api.post(
            '/ag/exchange/login',
            {
                username: AGENT_USERNAME,
                password: AGENT_PASSWORD
            },
            {
                headers: getHeaders(null, sessionCookie)
            }
        );

        // Debug Log
        console.log("Login Status Code:", loginResponse.status);

        // 1.3 Extract Token from various possible payload formats
        const resData = loginResponse.data;
        const token = resData.token || 
                      resData.access_token || 
                      resData.data?.token || 
                      resData.result?.token ||
                      resData.meta?.token;

        if (!token) {
            console.error("Login Response Payload:", JSON.stringify(resData));
            throw new Error("Token missing from login response payload.");
        }

        console.log("Step 3: Master Authorization Token acquired successfully!");
        return { token, cookie: sessionCookie };

    } catch (err) {
        console.error("Master Login Error Details:", err.response?.data || err.message);
        const errMsg = err.response?.data?.meta?.message || err.response?.data?.message || err.message;
        throw new Error(`Master Login Failed: ${errMsg}`);
    }
}

// Step 2: Create User Account using acquired Token
async function createAccountAPI(userData, authData) {
    try {
        console.log(`Step 4: Creating user account for '${userData.username}'...`);
        
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
            {
                headers: getHeaders(authData.token, authData.cookie)
            }
        );

        if (response.data && (response.data.meta?.status || response.data.status)) {
            return { success: true, response: response.data };
        } else {
            return { 
                success: false, 
                message: response.data?.meta?.message || response.data?.message || "Account creation failed at server." 
            };
        }
    } catch (err) {
        console.error("Create Account Error Details:", err.response?.data || err.message);
        return { 
            success: false, 
            message: err.response?.data?.meta?.message || err.response?.data?.message || err.message 
        };
    }
}

// Telegram Message Handling
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

    // Step A: Collect Full Name
    if (session.step === 'AWAITING_NAME') {
        session.data.fullName = text;
        session.step = 'AWAITING_USERNAME';
        await bot.sendMessage(chatId, `Got it, *${text}*!\n\nNow, please enter your desired *Username*:`, { parse_mode: "Markdown" });
        return;
    }

    // Step B: Collect Username
    if (session.step === 'AWAITING_USERNAME') {
        const cleanUsername = text.replace(/\s+/g, '');
        session.data.username = cleanUsername;
        session.step = 'AWAITING_PHONE';
        await bot.sendMessage(chatId, `Username set to \`${cleanUsername}\`.\n\nFinally, please provide your *Mobile Number*:`, { parse_mode: "Markdown" });
        return;
    }

    // Step C: Collect Phone & Trigger Sequential Flow
    if (session.step === 'AWAITING_PHONE') {
        session.data.phone = text;
        session.step = 'PROCESSING';

        await bot.sendMessage(chatId, "🔐 Logging into Master Account to get access token...");

        try {
            // 1. First Master Agent Logins & gets fresh token
            const authData = await getMasterAuthToken();
            
            await bot.sendMessage(chatId, "⚡ Token acquired! Creating your account now... ⏳");

            // 2. Uses the newly acquired token to create user ID
            const createResult = await createAccountAPI(session.data, authData);

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
                `❌ *Process Error:* ${error.message}\n\nType /start to try again.`
            );
        }

        delete userSessions[chatId];
    }
});
