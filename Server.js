const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');

// Express Server for Render Health Check
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot Active'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// Configuration
const TELEGRAM_TOKEN = "8981609410:AAF81-mFylHCBC_0ri3SHHIvZjPTM-KN13Y";
const AGENT_USERNAME = "Bro090";
const AGENT_PASSWORD = "Sourav123";
const MASTER_PASSWORD = "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const userSessions = {};

const COOKIE_FILE = path.join(__dirname, 'cookies.txt');

console.log("Telegram Bot Server Started...");

// Helper: Run Native cURL Command via Shell
function runCurl(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

// 1. Agent Login using cURL (Saves session cookie to cookies.txt)
async function loginAgentCurl() {
    const curlCommand = `curl -s -k -X POST "https://ag.sms444.com/ag/exchange/login" \
    -c "${COOKIE_FILE}" \
    -H "Content-Type: application/json" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -d "{\\"username\\":\\"${AGENT_USERNAME}\\",\\"password\\":\\"${AGENT_PASSWORD}\\"}"`;

    try {
        const response = await runCurl(curlCommand);
        return true;
    } catch (err) {
        console.error("cURL Login Error:", err.message);
        return false;
    }
}

// 2. User Creation using cURL with Cookie Session
async function createAccountWithCurl(requestedUsername, fullName, phoneNumber) {
    const loginSuccess = await loginAgentCurl();
    if (!loginSuccess) return { success: false };

    let candidateUsername = requestedUsername;
    let attempt = 0;

    while (attempt < 5) {
        const payload = JSON.stringify({
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
        });

        // Escaping double quotes for Linux Shell
        const escapedPayload = payload.replace(/"/g, '\\"');

        const createCommand = `curl -s -k -X POST "https://ag.sms444.com/ag/exchange/account/createAccount" \
        -b "${COOKIE_FILE}" \
        -H "Content-Type: application/json" \
        -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
        -d "${escapedPayload}"`;

        try {
            const rawResponse = await runCurl(createCommand);
            
            // Check success response
            if (rawResponse.includes("success") || rawResponse.includes("200") || rawResponse.includes("created")) {
                return { success: true, finalUsername: candidateUsername };
            }

            // If username is taken, try auto-increment suffix (e.g. Sourav121 -> Sourav12101)
            attempt++;
            candidateUsername = `${requestedUsername}${attempt < 10 ? '0' + attempt : attempt}`;

        } catch (err) {
            console.error("cURL Execution Error:", err.message);
            break;
        }
    }

    return { success: false };
}

// Telegram Message Handler
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

        const result = await createAccountWithCurl(session.username, session.name, session.phone);

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
