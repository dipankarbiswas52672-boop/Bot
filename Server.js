const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer');
const express = require('express');

// Express Server for Render Port Binding
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

console.log("Telegram Bot Server Started...");

async function createAccountWithPuppeteer(requestedUsername, fullName, phoneNumber) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. Agent Login
        await page.goto('https://ag.sms444.com/ag/exchange/login', { waitUntil: 'networkidle2', timeout: 60000 });

        await page.type('input[name="username"], input[type="text"]', AGENT_USERNAME);
        await page.type('input[name="password"], input[type="password"]', AGENT_PASSWORD);

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
            page.click('button[type="submit"]')
        ]);

        // 2. Open User Management Page
        await page.goto('https://ag.sms444.com/list/user', { waitUntil: 'networkidle2', timeout: 60000 });

        let candidateUsername = requestedUsername;
        let attempt = 0;
        let isSuccess = false;

        while (!isSuccess && attempt < 5) {
            const addButton = await page.$('button:has-text("Add User"), .add-user-btn');
            if (addButton) {
                await addButton.click();
            } else {
                await page.click('.btn-primary');
            }

            await page.waitForTimeout(1500);

            // Fill User Form
            await page.evaluate((u, n, p, pass, master) => {
                const inputs = document.querySelectorAll('input');
                inputs.forEach(input => {
                    const placeholder = (input.placeholder || '').toLowerCase();
                    const nameAttr = (input.name || '').toLowerCase();

                    if (nameAttr.includes('user') || placeholder.includes('username')) input.value = u;
                    if (nameAttr.includes('name') || placeholder.includes('name')) input.value = n;
                    if (nameAttr.includes('mobile') || placeholder.includes('mobile')) input.value = p;
                    if (nameAttr.includes('password') && !nameAttr.includes('master')) input.value = pass;
                    if (nameAttr.includes('confirm')) input.value = pass;
                    if (nameAttr.includes('master')) input.value = master;

                    input.dispatchEvent(new Event('input', { bubbles: true }));
                });
            }, candidateUsername, fullName, phoneNumber, DEFAULT_USER_PASSWORD, MASTER_PASSWORD);

            // Submit Form
            const submitBtn = await page.$('button[type="submit"], .modal-footer button');
            if (submitBtn) await submitBtn.click();

            await page.waitForTimeout(2000);

            const errorToast = await page.$('.error-message, .toast-error, .alert-danger');
            if (!errorToast) {
                isSuccess = true;
                await browser.close();
                return { success: true, finalUsername: candidateUsername };
            }

            attempt++;
            candidateUsername = `${requestedUsername}${attempt < 10 ? '0' + attempt : attempt}`;
        }

        await browser.close();
        return { success: false };

    } catch (err) {
        console.error("Puppeteer Automation Error:", err.message);
        if (browser) await browser.close();
        return { success: false };
    }
}

// Telegram Setup
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

        const result = await createAccountWithPuppeteer(session.username, session.name, session.phone);

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
