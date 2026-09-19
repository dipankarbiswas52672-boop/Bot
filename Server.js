const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Active'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// Configuration
const TELEGRAM_TOKEN = "8981609410:AAF81-mFylHCBC_0ri3SHHIvZjPTM-KN13Y";
const AGENT_LOGIN_URL = "https://ag.sms444.com/ag/exchange/login";
const CREATE_USER_URL = "https://ag.sms444.com/ag/exchange/account/createAccount";

const AGENT_USERNAME = "Bro090";
const AGENT_PASSWORD = "Sourav123";
const MASTER_PASSWORD = "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userSessions = {};

console.log("Telegram Bot Server Started...");

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { step: 1 };
    bot.sendMessage(chatId, "Welcome to SMS444 Account Setup! 🎲\n\nPlease enter your *Full Name*:", { parse_mode: "Markdown" });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    if (text.startsWith('/')) return;

    if (!userSessions[chatId]) {
        userSessions[chatId] = { step: 1 };
        await bot.sendMessage(chatId, "Welcome to SMS444 Account Setup! 🎲\n\nPlease enter your *Full Name*:");
        return;
    }

    const session = userSessions[chatId];

    // Step 1: Collect Name
    if (session.step === 1) {
        session.name = text;
        session.step = 2;
        await bot.sendMessage(chatId, `Thanks *${text}*!\n\nNow enter your preferred *Username*:`, { parse_mode: "Markdown" });
    } 
    // Step 2: Collect Username
    else if (session.step === 2) {
        session.username = text;
        session.step = 3;
        await bot.sendMessage(chatId, "Got it! Now enter your *10-digit Mobile Number*:");
    } 
    // Step 3: Collect Mobile & Register
    else if (session.step === 3) {
        session.phone = text;
        session.step = 4;

        await bot.sendMessage(chatId, "Creating your account, please wait a moment... ⌛");

        const result = await createAccountSmart(session.username, session.name, session.phone);

        if (result.success) {
            await bot.sendMessage(
                chatId, 
                `🎉 *Account Created Successfully!*\n\n🌐 *Website:* https://sms444.com\n👤 *Username:* \`${result.finalUsername}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n⚠️ *Important:* Please change your password right after your first login.`, 
                { parse_mode: "Markdown" }
            );
        } else {
            await bot.sendMessage(chatId, "❌ Account creation failed. Please try again later or contact customer support.");
        }

        delete userSessions[chatId];
    }
});

// Function to handle login, unique username verification, and user creation
async function createAccountSmart(requestedUsername, fullName, phoneNumber) {
    try {
        const client = axios.create({
            baseURL: 'https://ag.sms444.com',
            withCredentials: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // 1. Authenticate Agent
        const loginRes = await client.post('/ag/exchange/login', {
            username: AGENT_USERNAME,
            password: AGENT_PASSWORD
        });

        const cookies = loginRes.headers['set-cookie'];
        const requestHeaders = cookies ? { 'Cookie': cookies.join('; ') } : {};

        // 2. Auto-Increment Username logic if requested username already exists
        let candidateUsername = requestedUsername;
        let isSuccess = false;
        let attempt = 0;

        while (!isSuccess && attempt < 5) {
            const payload = {
                username: candidateUsername,
                name: fullName,
                commission: "0",
                openingBalance: "0",
                exposureLimit: "5000",
                creditReference: "0",
                mobile: phoneNumber,
                password: DEFAULT_USER_PASSWORD,
                confirmPassword: DEFAULT_USER_PASSWORD,
                masterPassword: MASTER_PASSWORD
            };

            try {
                const response = await client.post(CREATE_USER_URL, payload, { headers: requestHeaders });
                
                if (response.status === 200 || response.data.status === "success") {
                    isSuccess = true;
                    return { success: true, finalUsername: candidateUsername };
                }
            } catch (err) {
                // Status 422 usually indicates validation failure or existing username
                if (err.response && (err.response.status === 422 || err.response.status === 400)) {
                    attempt++;
                    candidateUsername = `${requestedUsername}${attempt < 10 ? '0' + attempt : attempt}`;
                } else {
                    console.error("API Connection Error:", err.message);
                    break;
                }
            }
        }

        return { success: false };

    } catch (error) {
        console.error("Agent Session Failure:", error.message);
        return { success: false };
    }
}
