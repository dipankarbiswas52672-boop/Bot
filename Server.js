const path = require('path');
const express = require('express');

// Dummy Express Server to satisfy Render Web Service Port Binding
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Telegram Bot is Live!'));
app.listen(PORT, () => console.log(`HTTP Server listening on port ${PORT}`));

// Helper Function: Puppeteer Browser Automation
async function createCasinoAccount(userData) {
    let browser;
    try {
        console.log("Launching Puppeteer Browser on Render...");
        
        // Custom Cache Path for Render Container
        const cacheDir = path.join(__dirname, '.cache', 'puppeteer');

        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--no-zygote'
            ],
            // Directing puppeteer to look inside src/.cache
            env: {
                ...process.env,
                PUPPETEER_CACHE_DIR: cacheDir
            }
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        console.log("Navigating to Agent Login Page...");
        await page.goto(AGENT_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // 1. Login to Agent Panel
        await page.waitForSelector('input[placeholder="Username"]', { timeout: 20000 });
        await page.type('input[placeholder="Username"]', AGENT_USERNAME);
        await page.type('input[placeholder="Password"]', AGENT_PASSWORD);

        console.log("Submitting Login...");
        await Promise.all([
            page.click('button[type="submit"], button:has-text("Login")'),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);

        // 2. Direct Navigate to User List Page
        console.log("Navigating to User List Page...");
        await page.goto(ADD_USER_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // 3. Open Add User Modal
        console.log("Opening Add User Modal...");
        await page.waitForSelector('button:has-text("Add User"), .btn:has-text("Add User")', { timeout: 20000 });
        await page.click('button:has-text("Add User"), .btn:has-text("Add User")');

        // 4. Fill Form Fields
        console.log("Filling Form Data...");
        await page.waitForSelector('input[placeholder="Username.."]', { timeout: 20000 });

        await page.type('input[placeholder="Username.."]', userData.username);
        await page.type('input[placeholder="Name.."]', userData.name);
        await page.type('input[placeholder="Commission.."]', '0');
        await page.type('input[placeholder="Opening Balance.."]', '0');
        await page.type('input[placeholder="Exposure Limit"]', '0');
        await page.type('input[placeholder="Credit Reference.."]', '0');
        await page.type('input[placeholder="Mobile Number.."]', userData.phone);
        await page.type('input[placeholder="Password.."]', userData.userPassword);
        await page.type('input[placeholder="Confirm Password.."]', userData.userPassword);

        // Fill Master Password field if present in form
        const masterPassInput = await page.$('input[placeholder="Master Password.."]');
        if (masterPassInput) {
            await page.type('input[placeholder="Master Password.."]', MASTER_PASSWORD);
        }

        // 5. Submit Form
        console.log("Submitting Account Creation...");
        await page.click('button:has-text("Create"), button:has-text("Submit"), button[type="submit"]');
        await new Promise(r => setTimeout(r, 5000));

        console.log("Account Creation Completed Successfully!");
        await browser.close();
        return true;

    } catch (error) {
        console.error("Puppeteer Automation Failed with Error:", error.message);
        if (browser) await browser.close();
        return false;
    }
}
