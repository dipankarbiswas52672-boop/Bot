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

// Telegram Agent Handle (without @ for deep linking)
const AGENT_TELEGRAM_USER = "agsms444"; 

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN environment variable missing!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Memory Store for User Sessions & Refund Timers
const userSessions = {};
const userAccountStore = {}; // Stores username and creation timestamp

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

// Helper: Calculate remaining time for 12 hours
function getRemainingRefundTime(createdAt) {
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const now = Date.now();
    const elapsedTime = now - createdAt;
    const remainingTime = twelveHoursMs - elapsedTime;

    if (remainingTime <= 0) {
        return { ready: true, text: "00h 00m 00s" };
    }

    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

    const formattedTime = `${hours}h ${minutes}m ${seconds}s`;
    return { ready: false, text: formattedTime };
}

// Helper: Generate Auto-filled Agent URL
function getAgentRedirectUrl(type, username = "") {
    let text = "";
    if (type === 'deposit') {
        text = username ? `Hello Agent, I want to deposit funds for Username: ${username}` : `Hello Agent, I want to make a deposit.`;
    } else if (type === 'refund') {
        text = username ? `Hello Agent, I want to claim Loss Refund for Username: ${username}` : `Hello Agent, I want to claim Loss Refund.`;
    }
    return `https://t.me/${AGENT_TELEGRAM_USER}?text=${encodeURIComponent(text)}`;
}

// Deposit Redirect Helper
async function sendDepositRedirect(chatId) {
    const userAcc = userAccountStore[chatId];
    const username = userAcc ? userAcc.username : "";
    const redirectUrl = getAgentRedirectUrl('deposit', username);

    const messageText = `💳 *Deposit & Payment Desk*\n\nUsername: \`${username || "Not Registered"}\`\n\nClick below to connect with agent. Your username will be automatically attached to your message!`;
    
    await bot.sendMessage(chatId, messageText, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "💬 Contact Agent to Deposit (@agsms444)",
                        url: redirectUrl
                    }
                ]
            ]
        }
    });
}

// Send Main Welcome Menu
async function sendStartMenu(chatId, firstName = "") {
    const userAcc = userAccountStore[chatId];
    const depositUrl = getAgentRedirectUrl('deposit', userAcc?.username || "");

    const welcomeMsg = `🔥 *Welcome to SMS444 Official Bot!* ${firstName ? `Hello *${firstName}*! ` : ''}🎰

🎁 *TODAY'S SPECIAL OFFER:*
💸 *100% Loss Refund Guarantee!*
- Account create korar 12 hour por loss refund claim kora jabe!
- Fast payouts & 24/7 Support.

👇 *Choose an option below:*`;

    await bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "👤 Create New Account", callback_data: "START_REGISTER" },
                    { text: "💳 Deposit Funds", url: depositUrl }
                ],
                [
                    { text: "⏱️ Refund Claim / Countdown", callback_data: "SHOW_OFFER" },
                    { text: "💬 Live Support", url: depositUrl }
                ]
            ]
        }
    });
}

// Handle Inline Keyboard Callbacks
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    await bot.answerCallbackQuery(query.id);

    if (action === 'START_REGISTER') {
        userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
        await bot.sendMessage(chatId, "👤 *Account Creation Wizard*\n\nPlease reply with your *Full Name* to start registration:", { parse_mode: "Markdown" });
    } else if (action === 'SHOW_OFFER') {
        const userAcc = userAccountStore[chatId];

        if (!userAcc) {
            await bot.sendMessage(chatId, "⚠️ *No Active Account Found!*\n\nPlease create an account first to start the 12-hour Loss Refund Countdown.", {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [[{ text: "👤 Create Account Now", callback_data: "START_REGISTER" }]]
                }
            });
            return;
        }

        const timer = getRemainingRefundTime(userAcc.createdAt);
        const refundUrl = getAgentRedirectUrl('refund', userAcc.username);

        if (timer.ready) {
            const readyMsg = `🎉 *CONGRATULATIONS!* 🎉\n\nYour 12-hour waiting time is complete for Username: \`${userAcc.username}\`!\n\nYou can now claim your *100% Loss Refund* directly from our Agent!`;
            await bot.sendMessage(chatId, readyMsg, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💸 Claim Loss Refund Now (@agsms444)", url: refundUrl }]
                    ]
                }
            });
        } else {
            const countdownMsg = `⏱️ *LOSS REFUND COUNTDOWN ACTIVE*\n\n👤 *Username:* \`${userAcc.username}\`\n⏳ *Time Remaining:* \`${timer.text}\`\n\n⚠️ *Rule:* Account creation-er 12 hours complete hobar por refund claim kora jabe. Countdown sesh hole opor-er button-e click kore direct agent-ke message din!`;
            await bot.sendMessage(chatId, countdownMsg, {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Refresh Countdown Status", callback_data: "SHOW_OFFER" }],
                        [{ text: "💳 Deposit Funds", url: getAgentRedirectUrl('deposit', userAcc.username) }]
                    ]
                }
            });
        }
    }
});

// Telegram Message Handling
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    if (!text) return;

    const lowerText = text.toLowerCase();

    // Check for Deposit Keywords
    if (lowerText === 'deposit' || lowerText === 'depo' || lowerText === 'ডিপোজিট' || lowerText === '/deposit') {
        await sendDepositRedirect(chatId);
        return;
    }

    // Check for Offer/Refund Keywords
    if (lowerText.includes('offer') || lowerText.includes('loss') || lowerText.includes('refund') || lowerText.includes('অফার')) {
        const userAcc = userAccountStore[chatId];
        const refundUrl = getAgentRedirectUrl('refund', userAcc?.username || "");
        
        await bot.sendMessage(chatId, `🎁 *Loss Refund Status*\n\nType /start or click below to check your 12-hour countdown status!`, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⏱️ Check Countdown Status", callback_data: "SHOW_OFFER" }],
                    [{ text: "💬 Contact Agent (@agsms444)", url: refundUrl }]
                ]
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
                // Save user account creation timestamp for 12-hour countdown
                userAccountStore[chatId] = {
                    username: session.data.username,
                    createdAt: Date.now()
                };

                const depositUrl = getAgentRedirectUrl('deposit', session.data.username);

                await bot.sendMessage(
                    chatId,
                    `🎉 *Account Created Successfully!*\n\n🌐 *URL:* https://sms444.com\n👤 *Username:* \`${session.data.username}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n⏱️ *12-Hour Refund Countdown Started!*\nRefund claim countdown has begun automatically. You can claim loss refund after 12 hours!\n\n💳 *Deposit Now:* Click below (Username will be auto-sent to agent).`,
                    {
                        parse_mode: "Markdown",
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "💳 Deposit Now (Auto Username)",
                                        url: depositUrl
                                    }
                                ],
                                [
                                    {
                                        text: "⏱️ Check Refund Countdown",
                                        callback_data: "SHOW_OFFER"
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
                                        
