const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const { Groq } = require('groq-sdk');

// Express Server for Render Keep-Alive
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SMS444 Agent Bot Active'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Environment Variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

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
const groq = new Groq({ apiKey: GROQ_API_KEY });
const userSessions = {};

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
                headers: {
                    'Host': DOMAIN,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*'
                },
                rejectUnauthorized: false
            }
        );

        const token = response.data.token || response.data.access_token || response.data.data?.token;
        if (!token) {
            throw new Error("Token missing in response");
        }
        return token;
    } catch (err) {
        console.error("Master Login Error:", err.response?.data || err.message);
        throw new Error("Master Account Login Failed");
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
                    'Host': DOMAIN,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
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

// Step 3: Handle Groq AI Agent via Official SDK
async function handleGroqAgent(chatId, userMessage) {
    if (!userSessions[chatId]) {
        userSessions[chatId] = {
            history: [],
            collected: { fullName: null, username: null, phone: null }
        };
    }

    const session = userSessions[chatId];
    session.history.push({ role: "user", content: userMessage });

    const systemPrompt = `You are an agent for SMS444. Collect 3 pieces of information:
1. Full Name
2. Desired Username
3. Mobile Number

When all 3 are gathered, output this JSON at the very end:
{"status": "COMPLETE", "fullName": "...", "username": "...", "phone": "..."}`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                ...session.history
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2
        });

        const aiReply = chatCompletion.choices[0]?.message?.content || "";
        session.history.push({ role: "assistant", content: aiReply });

        const jsonMatch = aiReply.match(/\{"status":\s*"COMPLETE".*?\}/s);
        if (jsonMatch) {
            const parsedData = JSON.parse(jsonMatch[0]);
            const cleanText = aiReply.replace(jsonMatch[0], '').trim();
            return { isComplete: true, data: parsedData, replyText: cleanText };
        }

        return { isComplete: false, replyText: aiReply };

    } catch (err) {
        console.error("Groq SDK Error:", err.message);
        return { isComplete: false, replyText: "I couldn't process that properly. Could you re-enter the info?" };
    }
}

// Telegram Message Handling
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    if (!text) return;

    if (text.startsWith('/start')) {
        delete userSessions[chatId];
        await bot.sendMessage(
            chatId, 
            "Hello! Welcome to SMS444. 🎰\n\nI can help you create your account right away. May I have your *Full Name*?", 
            { parse_mode: "Markdown" }
        );
        return;
    }

    const agentRes = await handleGroqAgent(chatId, text);

    if (agentRes.replyText) {
        await bot.sendMessage(chatId, agentRes.replyText);
    }

    if (agentRes.isComplete) {
        await bot.sendMessage(chatId, "Authenticating Master Account & Creating ID... ⏳");

        try {
            const token = await getMasterAuthToken();
            const createResult = await createAccountAPI(agentRes.data, token);

            if (createResult.success) {
                await bot.sendMessage(
                    chatId,
                    `🎉 *Account Created Successfully!*\n\n🌐 *URL:* https://sms444.com\n👤 *Username:* \`${agentRes.data.username}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n⚠️ *Important:* Log in and change your password immediately.`,
                    { parse_mode: "Markdown" }
                );
            } else {
                await bot.sendMessage(
                    chatId,
                    `❌ *Account Creation Failed*\n*Reason:* ${createResult.message}`
                );
            }
        } catch (error) {
            await bot.sendMessage(
                chatId,
                `❌ *Process Error:* ${error.message}. Please try again.`
            );
        }

        delete userSessions[chatId];
    }
});
            
