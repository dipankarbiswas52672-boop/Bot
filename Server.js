const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// Express Server for Render Keep-Alive & Health Check
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('SMS444 Agent Bot Active & Healthy'));
app.get('/health', (req, res) => res.status(200).send('OK'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Environment Variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const AGENT_USERNAME = (process.env.AGENT_USERNAME || "bro090").toLowerCase();
const AGENT_PASSWORD = process.env.AGENT_PASSWORD || "Sourav123";
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "Sourav123";
const DEFAULT_USER_PASSWORD = "Abcd1234";

const HARDCODED_MASTER_TOKEN = process.env.MASTER_BEARER_TOKEN || "";

const SERVER_IP = "43.204.42.19";
const DOMAIN = "ag.sms444.com";
const BASE_URL = `https://${SERVER_IP}`;

const AGENT_TELEGRAM_USER = "agsms444"; 

if (!TELEGRAM_TOKEN) {
    console.error("ERROR: TELEGRAM_TOKEN environment variable missing!");
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
    console.error(`Telegram Polling Error: ${error.code} -${error.message}`);
});

const userSessions = {};
const userAccountStore = {}; 
let cachedMasterToken = null;

const api = axios.create({
    baseURL: BASE_URL,
    timeout: 15000,
    rejectUnauthorized: false
});

const getHeaders = (token = null) => {
    const headers = {
        'Host': DOMAIN,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': `https://${DOMAIN}`,
        'Referer': `https://${DOMAIN}/login`
    };

    if (token) {
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    return headers;
};

// Automated Master Auth Token Fetcher
async function getMasterAuthToken(forceRefresh = false) {
    if (cachedMasterToken && !forceRefresh) {
        return cachedMasterToken;
    }

    try {
        console.log("Attempting Master Agent Login for fresh token...");

        const response = await api.post(
            '/ag/login/agentLogin',
            {
                userName: AGENT_USERNAME,
                password: AGENT_PASSWORD
            },
            { headers: getHeaders() }
        );

        let token = response.data?.data?.accessToken || response.data?.accessToken;

        if (token) {
            console.log("Master Authorization Token Successfully Acquired!");
            cachedMasterToken = token.replace(/^Bearer\s+/i, '');
            return cachedMasterToken;
        }
    } catch (err) {
        console.warn("Agent Login API Call Failed:", err.response?.data || err.message);
    }

    if (HARDCODED_MASTER_TOKEN) {
        console.log("Using Fallback MASTER_BEARER_TOKEN from Env Variables...");
        cachedMasterToken = HARDCODED_MASTER_TOKEN.replace(/^Bearer\s+/i, '');
        return cachedMasterToken;
    }

    throw new Error("Master Login failed and no fallback token available.");
}

// Create Account API Call with Auto Retry Logic
async function createAccountAPI(userData, isRetry = false) {
    try {
        const token = await getMasterAuthToken(isRetry);
        console.log(`Sending Create Account Request for: ${userData.username} (Is Retry:${isRetry})`);

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

        const responseMsg = response.data?.meta?.message || response.data?.message || "";

        if (responseMsg.toLowerCase().includes("invalid token") || responseMsg.toLowerCase().includes("expired") || responseMsg.toLowerCase().includes("unauthorized")) {
            if (!isRetry) {
                console.warn("Expired token detected! Re-authenticating and retrying...");
                cachedMasterToken = null;
                return await createAccountAPI(userData, true);
            }
        }

        if (response.data && response.data.meta && response.data.meta.status) {
            return { success: true, response: response.data };
        } else {
            return { 
                success: false, 
                message: responseMsg || "Server rejected account creation." 
            };
        }
    } catch (err) {
        console.error("Create Account Error:", err.response?.data || err.message);
        
        const status = err.response?.status;
        const errDataMsg = err.response?.data?.meta?.message || err.response?.data?.message || "";

        if (!isRetry && (status === 401 || status === 403 || errDataMsg.toLowerCase().includes("token"))) {
            console.warn("Auth Error detected! Re-authenticating with fresh master token...");
            cachedMasterToken = null;
            return await createAccountAPI(userData, true);
        }

        return { 
            success: false, 
            message: errDataMsg || err.message 
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

    return { ready: false, text: `${hours}h ${minutes}m${seconds}s` };
}

// Helper: Auto-filled Agent URL
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

    const messageText = `💳 *Deposit & Payment Desk*\n\n👤 *Saved Identity Username:* \`${username || "Not Registered Yet"}\`\n\nClick below to connect with agent. Your username will be automatically forwarded!`;
    
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

    let identityStatus = "";
    if (userAcc) {
        identityStatus = `\n✅ *Existing Account Linked:* \`${userAcc.username}\``;
    } else {
        identityStatus = `\n⚠️ *Account Status:* No account linked yet.`;
    }

    const welcomeMsg = `🔥 *Welcome to SMS444 Official Bot!* ${firstName ? `Hello *${firstName}*! ` : ''}🎰${identityStatus}

🎁 *TODAY'S SPECIAL OFFER:*
💸 *100% Loss Refund Guarantee!*
- You will be eligible to receive the loss refund 12 hours after creating your account..

👇 *Choose an option below:*`;

    const keyboardOptions = [];

    if (userAcc) {
        keyboardOptions.push([
            { text: "👤 Account Details", callback_data: "VIEW_PROFILE" },
            { text: "💳 Deposit Funds", url: depositUrl }
        ]);
    } else {
        keyboardOptions.push([
            { text: "👤 Create New Account", callback_data: "START_REGISTER" },
            { text: "💳 Deposit Funds", url: depositUrl }
        ]);
    }

    keyboardOptions.push([
        { text: "⏱️ Refund Claim / Countdown", callback_data: "SHOW_OFFER" },
        { text: "💬 Live Support", url: depositUrl }
    ]);

    await bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: keyboardOptions
        }
    });
}

// Helper: Submit Account Creation
async function submitAccountCreation(chatId, session) {
    await bot.sendMessage(chatId, "🔐 Ai Agent Creating Account...");

    try {
        const createResult = await createAccountAPI(session.data);

        if (createResult.success) {
            userAccountStore[chatId] = {
                username: session.data.username,
                fullName: session.data.fullName,
                createdAt: Date.now()
            };

            const depositUrl = getAgentRedirectUrl('deposit', session.data.username);

            await bot.sendMessage(
                chatId,
                `🎉 *Account Created Successfully!*\n\n🌐 *URL:* https://sms444.com\n👤 *Username:* \`${session.data.username}\`\n🔑 *Password:* \`${DEFAULT_USER_PASSWORD}\`\n\n✅ *Identity Linked:* Your Telegram account is now saved with Username \`${session.data.username}\`.\n\n⏱️ *12-Hour Refund Countdown Started!*\n\n💳 *Deposit Now:* Click below to connect to agent.`,
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

            delete userSessions[chatId];
        } else {
            const errorMsg = createResult.message ? createResult.message.toLowerCase() : "";

            if (errorMsg.includes("already exist") || errorMsg.includes("username") || errorMsg.includes("taken") || errorMsg.includes("duplicate")) {
                session.step = 'AWAITING_USERNAME';
                
                await bot.sendMessage(
                    chatId,
                    `⚠️ *Username Unavailable!*\n\nThe username \`${session.data.username}\` is already taken on the server.\n\n👉 *Please type a new unique Username to try again:*`,
                    { parse_mode: "Markdown" }
                );
            } else {
                await bot.sendMessage(
                    chatId,
                    `❌ *Account Creation Failed*\n*Reason:* ${createResult.message}\n\nType /start to try again.`
                );
                delete userSessions[chatId];
            }
        }
    } catch (error) {
        await bot.sendMessage(
            chatId,
            `❌ *Process Error:* ${error.message}\n\nType /start to try again.`
        );
        delete userSessions[chatId];
    }
}

// Handle Inline Keyboard Callbacks
bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const action = query.data;

        await bot.answerCallbackQuery(query.id);

        if (action === 'START_REGISTER') {
            if (userAccountStore[chatId]) {
                await bot.sendMessage(chatId, `⚠️ *Account Already Exists!*\n\nYour Telegram account is already linked with Username: \`${userAccountStore[chatId].username}\`. Multiple account creation is restricted!`, { parse_mode: "Markdown" });
                return;
            }

            userSessions[chatId] = { step: 'AWAITING_NAME', data: {} };
            await bot.sendMessage(chatId, "👤 *Account Creation Wizard*\n\nPlease reply with your *Full Name* to start registration:", { parse_mode: "Markdown" });
        } else if (action === 'VIEW_PROFILE') {
            const userAcc = userAccountStore[chatId];
            if (userAcc) {
                await bot.sendMessage(chatId, `👤 *YOUR SAVED ACCOUNT IDENTITY*\n\n• *Full Name:* ${userAcc.fullName}\n• *Username:* \`${userAcc.username}\`\n• *Registered On:* ${new Date(userAcc.createdAt).toLocaleString()}\n\n💳 *Deposit Handle:* @agsms444`, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [[{ text: "💳 Deposit Funds", url: getAgentRedirectUrl('deposit', userAcc.username) }]]
                    }
                });
            }
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
                const readyMsg = `🎉 *CONGRATULATIONS!* 🎉\n\nYour 12-hour waiting time is complete for Saved Username: \`${userAcc.username}\`!\n\nYou can now claim your *100% Loss Refund* directly from our Agent!`;
                await bot.sendMessage(chatId, readyMsg, {
                    parse_mode: "Markdown",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "💸 Claim Loss Refund Now (@agsms444)", url: refundUrl }]
                        ]
                    }
                });
            } else {
                const countdownMsg = `⏱️ *LOSS REFUND COUNTDOWN ACTIVE*\n\n👤 *Linked Username:* \`${userAcc.username}\`\n⏳ *Time Remaining:* \`${timer.text}\`\n\n⚠️ *Rule:* You will be eligible to receive the loss refund 12 hours after creating your account..`;
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
    } catch (err) {
        console.error("Callback Error:", err.message);
    }
});

// Telegram Message Handling
bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text ? msg.text.trim() : "";

        if (!text) return;

        const lowerText = text.toLowerCase();

        if (lowerText === 'deposit' || lowerText === 'depo' || lowerText === 'ডিপোজিট' || lowerText === '/deposit') {
            await sendDepositRedirect(chatId);
            return;
        }

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

        if (text.startsWith('/start')) {
            delete userSessions[chatId];
            await sendStartMenu(chatId, msg.from?.first_name || "");
            return;
        }

        const session = userSessions[chatId];

        if (!session) {
            await sendStartMenu(chatId, msg.from?.first_name || "");
            return;
        }

        if (session.step === 'AWAITING_NAME') {
            session.data.fullName = text;
            session.step = 'AWAITING_USERNAME';
            await bot.sendMessage(chatId, `Got it, *${text}*!\n\nNow, enter your desired *Username*:`, { parse_mode: "Markdown" });
            return;
        }

        if (session.step === 'AWAITING_USERNAME') {
            session.data.username = text.replace(/\s+/g, '');

            if (session.data.phone) {
                await submitAccountCreation(chatId, session);
            } else {
                session.step = 'AWAITING_PHONE';
                await bot.sendMessage(chatId, `Username set to: \`${session.data.username}\`\n\nFinally, enter your *Mobile Number*:`, { parse_mode: "Markdown" });
            }
            return;
        }

        if (session.step === 'AWAITING_PHONE') {
            session.data.phone = text;
            session.step = 'PROCESSING';

            await submitAccountCreation(chatId, session);
        }
    } catch (err) {
        console.error("Message Handler Error:", err.message);
    }
});

// GLOBAL PROCESS CRASH PROTECTION
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection:', reason);
});
