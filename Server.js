const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');

// --- CONFIGURATION SETUP ---
const TELEGRAM_TOKEN = "8981609410:AAF81-mFylHCBC_0ri3SHHIvZjPTM-KN13Y";

// Agent Site Credentials
const AGENT_LOGIN_URL = "https://ag.sms444.com/";
const AGENT_USERNAME = "Bro090";
const AGENT_PASSWORD = "Sourav123";
const MASTER_PASSWORD = "Sourav123";

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// User Session State Tracking
const userSessions = {};

console.log("Telegram Bot Server Started...");

// Bot Start Command (/start)
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userSessions[chatId] = { step: 1 };

    bot.sendMessage(chatId, "Welcome to SMS444 Auto Account Setup! 🎲\n\nPlease enter your *Full Name*:", { parse_mode: "Markdown" });
});

// Incoming Messages Handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : "";

    // Ignore commands like /start
    if (text.startsWith('/')) return;

    // Start session automatically if not started
    if (!userSessions[chatId]) {
        userSessions[chatId] = { step: 1 };
        await bot.sendMessage(chatId, "Welcome to SMS444 Auto Account Setup! 🎲\n\nPlease enter your *Full Name*:");
        return;
    }

    const session = userSessions[chatId];

    // Step 1: Receive Name
    if (session.step === 1) {
        session.name = text;
        session.step = 2;
        await bot.sendMessage(chatId, `Thanks *${text}*!\n\nNow enter your preferred *Username* (only letters & numbers):`, { parse_mode: "Markdown" });
    } 
    // Step 2: Receive Username
    else if (session.step === 2) {
        session.username = text;
        session.step = 3;
        await bot.sendMessage(chatId, "Got it! Now enter your *10-digit Mobile Number*:");
    } 
    // Step 3: Receive Mobile Number & Create Account
    else if (session.step === 3) {
        session.phone = text;
        session.step = 4;
        
        // Auto generate password
        session.userPassword = "Pass@" + Math.floor(1000 + Math.random() * 9000);

        await bot.sendMessage(chatId, "Creating your account on ag.sms444.com, please wait a few seconds... ⌛");

        // Puppeteer Automation Call
        const success = await createCasinoAccount(session);

        if (success) {
            await bot.sendMessage(chatId, `🎉 *Account Created Successfully!*\n\n🌐 *Website:* https://sms444.com\n👤 *Username:* ${session.username}\n🔑 *Password:* ${session.userPassword}\n\nPlease change your password after your first login!`, { parse_mode: "Markdown" });
        } else {
            await bot.sendMessage(chatId, "❌ Sorry, account creation failed automatically. Please check details or contact support.");
        }

        delete userSessions[chatId]; // Reset session
    }
});

// Helper Function: Puppeteer Browser Automation
async function createCasinoAccount(userData) {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(AGENT_LOGIN_URL, { waitUntil: 'networkidle2' });

        // 1. Login to Agent Panel
        await page.waitForSelector('input[placeholder="Username"]');
        await page.type('input[placeholder="Username"]', AGENT_USERNAME);
        await page.type('input[placeholder="Password"]', AGENT_PASSWORD);
        
        await Promise.all([
            page.click('button[type="submit"], button:has-text("Login")'),
            page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
        ]);

        // 2. Open Add User Modal
        await page.waitForSelector('button:has-text("Add User"), .btn:has-text("Add User")', { timeout: 15000 });
        await page.click('button:has-text("Add User"), .btn:has-text("Add User")');

        // 3. Fill Form Fields
        await page.waitForSelector('input[placeholder="Username.."]', { timeout: 10000 });

        await page.type('input[placeholder="Username.."]', userData.username);
        await page.type('input[placeholder="Name.."]', userData.name);
        await page.type('input[placeholder="Commission.."]', '0');
        await page.type('input[placeholder="Opening Balance.."]', '0');
        await page.type('input[placeholder="Exposure Limit"]', '0');
        await page.type('input[placeholder="Credit Reference.."]', '0');
        await page.type('input[placeholder="Mobile Number.."]', userData.phone);
        await page.type('input[placeholder="Password.."]', userData.userPassword);
        await page.type('input[placeholder="Confirm Password.."]', userData.userPassword);
        await page.type('input[placeholder="Master Password.."]', MASTER_PASSWORD);

        // 4. Submit Form
        await page.click('button:has-text("Create")');
        await new Promise(r => setTimeout(r, 4000));

        await browser.close();
        return true;

    } catch (error) {
        console.error("Puppeteer Automation Error:", error);
        if (browser) await browser.close();
        return false;
    }
    }
  
