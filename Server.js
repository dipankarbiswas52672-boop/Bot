const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// Express Keep-Alive Server for Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('SMS444 Agent Bot is Running...'));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Environment Variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Master Credentials
const AGENT_USERNAME = process.env.AGENT_USERNAME || "Bro090";
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "Sourav123";
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

// Server Infrastructure
const SERVER_IP = "43.204.42.19";
const DOMAIN = "ag.sms444.com";
const BASE_URL = `https://${SERVER_IP}`;

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN environment variable missing!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
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

        // Token extract logic
        const token = response.data.token || response.data.access_token || response.data.data?.token;
        if (!token) {
            throw new Error("Token missing in login response");
        }
        return token;
    } catch (err) {
        console.error("Master Login Failed:", err.response?.data || err.message);
        throw new Error("Master Account Login Failed");
    }
}

// Step 2: Create User Account using collected data & Bearer Token
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

// Step 3: Groq AI Dialogue Manager for Collecting User Data
async function handleGroqAgent(chatId, userMessage) {
    if (!userSessions[chatId]) {
        userSessions[chatId] = {
            history: [],
            collected: { fullName: null, username: null, phone: null }
        };
    }

    const session = userSessions[chatId];
    session.history.push({ role: "user", content: userMessage });

    const systemPrompt = `You are a professional support representative for SMS444.
Your sole job is to politely collect 3 pieces of information from the customer to register their account:
1. Full Name
2. Desired Username
3. Mobile Number

Currently collected data: ${JSON.stringify(session.collected)}

Instructions:
- Be warm, helpful, and concise.
- Ask for missing details one at a time.
- As soon as you have all 3 details (fullName, username, phone), append ONLY this exact JSON object at the very end of your response:
{"status": "COMPLETE", "fullName": "...", "username": "...", "phone": "..."}`;

    try {
        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...session.history
                ],
                temperature: 0.2
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const aiReply = response.data.choices[0].message.content;
        session.history.push({ role: "assistant", content: aiReply });

        // Check if data collection is complete
        const jsonMatch = aiReply.match(/\{"status":\s*"COMPLETE".*?\}/s);
        if (jsonMatch) {
            const parsedData = JSON.parse(jsonMatch[0]);
            const cleanText = aiReply.replace(jsonMatch[0], '').trim();
            return { isComplete: true, data: parsedData, replyText: cleanText };
        }

        return { isComplete: false, replyText: aiReply };

    } catch (err) {
        console.error("Groq AI Error:", err.message);
        return { isComplete: false, replyText: "I missed that. Could you please state the detail again?" };
    }
}

// Telegram Event Handler
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

    // Chat with Groq Agent
    const agentRes = await handleGroqAgent(chatId, text);

    if (agentRes.replyText) {
        await bot.sendMessage(chatId, agentRes.replyText);
    }

    // Trigger API Execution Workflow when all data is gathered
    if (agentRes.isComplete) {
        await bot.sendMessage(chatId, "Great! Authenticating with Master Account & creating your user ID... ⏳");

        try {
            // 1. Get Master Auth Token
            const token = await getMasterAuthToken();

            // 2. Post User Creation
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
                `❌ *Process Error:* ${error.message}. Please try again later.`
            );
        }

        delete userSessions[chatId];
    }
});
