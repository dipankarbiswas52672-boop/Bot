const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const express = require('express');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Active'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// Configuration
const TELEGRAM_TOKEN = "8981609410:AAF81-mFylHCBC_0ri3SHHIvZjPTM-KN13Y";
const BASE_HOST = "sms444.com";
const AGENT_USERNAME = "Bro090";
const AGENT_PASSWORD = "Sourav123";
const MASTER_PASSWORD = "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userSessions = {};

console.log("Telegram Bot Server Started...");

// Native HTTPS Request Function (Emulates cURL directly without shell spawn)
function makeHttpRequest(path, method, payload, cookieHeader = '') {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);

        const options = {
            hostname: BASE_HOST,
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': `https://${BASE_HOST}/list/user`,
                'Origin': `https://${BASE_HOST}`,
                ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            let data = '';
            const setCookieHeader = res.headers['set-cookie'];

            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    cookies: setCookieHeader ? setCookieHeader.map(c => c.split(';')[0]).join('; ') : '',
                    body: data
                });
            });
        });

        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
}

// Full Creation Logic with Auto-Increment Username Support
async function createAccountSmart(requestedUsername, fullName, phoneNumber) {
    try {
        // 1. Agent Login
        const loginPayload = { username: AGENT_USERNAME, password: AGENT_PASSWORD };
        const loginRes = await makeHttpRequest('/ag/exchange/login', 'POST', loginPayload);

        if (loginRes.statusCode !== 200 && !loginRes.cookies) {
            console.error("Login Failed Body:", loginRes.body);
            return { success: false };
        }

        const sessionCookie = loginRes.cookies;
        let candidateUsername = requestedUsername;
        let attempt = 0;

        // 2. Account Creation Loop with Auto Suffix if username exists
        while (attempt < 5) {
            const createPayload = {
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

            const createRes = await makeHttpRequest('/ag/exchange/account/createAccount', 'POST', createPayload, sessionCookie);

            if (createRes.statusCode === 200 || createRes.body.includes("success")) {
                return { success: true, finalUsername: candidateUsername };
            }

            // If status is 422/400 (Duplicate Username), increment suffix
            attempt++;
            candidateUsername = `${requestedUsername}${attempt < 10 ? '0' + attempt : attempt}`;
        }

        return { success: false };

    } catch (error) {
        console.error("Execution Failure:", error.message);
        return { success: false };
    }
}

// Bot Command Handlers
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

    if (session.step === 1) {
        session.name = text;
        session.step = 2;
        await bot.sendMessage(chatId, `Thanks *${text}*!\n\nNow enter your preferred *Username*:`, { parse_mode: "Markdown" });
    } 
    else if (session.step === 2) {
        session.username = text;
        session.step = 3;
        await bot.sendMessage(chatId, "Got it! Now enter your *10-digit Mobile Number*:");
    } 
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
