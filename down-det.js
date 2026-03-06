const express = require("express");
const puppeteer = require("puppeteer-extra"); 
const StealthPlugin = require("puppeteer-extra-plugin-stealth"); 
const https = require("https");

// Ενεργοποίηση Stealth Mode
puppeteer.use(StealthPlugin());

const WEBHOOK_URL = "https://automations-n8n.xadp6y.easypanel.host/webhook/pc/puppeteer/downdetector";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isServer = !!process.env.PUPPETEER_EXECUTABLE_PATH;

// Helper για POST requests
function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const data = Buffer.from(JSON.stringify(payload), "utf8");

    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname + (url.search || ""),
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body,
          });
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Η κύρια συνάρτηση scraping που είχες
async function runScraper() {
  let browser = null;
  let page = null;

  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Launching Stealth Puppeteer... (Server Mode: ${isServer})`);
    
    const launchOptions = {
      headless: isServer ? "new" : false, 
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      ignoreDefaultArgs: ["--enable-automation"], 
      args: [
        "--disable-blink-features=AutomationControlled", 
        "--window-size=1920,1080"
      ]
    };

    if (isServer) {
        launchOptions.args.push("--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage");
    }

    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.setViewport({ width: 1366, height: 768 + Math.floor(Math.random() * 100) });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/'
    });

    console.log("Navigating to Google first to build trust...");
    await page.goto("https://www.google.com");
    await sleep(1500 + Math.random() * 1000); 

    console.log("Navigating to Downdetector...");
    await page.goto("https://downdetector.gr/", { waitUntil: "networkidle2", timeout: 60000 });

    await page.mouse.move(Math.random() * 500, Math.random() * 500);
    await sleep(500);

    try {
      const btn = await page.$("#onetrust-accept-btn-handler");
      if (btn) {
          await btn.click();
          await sleep(1000);
      }
    } catch (e) {}

    const targetDivsCount = await page.evaluate(() => document.querySelectorAll("div.py-2.px-6").length);
    if (targetDivsCount === 0) {
        throw new Error("No target divs (div.py-2.px-6) found (Possible Blocking by Cloudflare/WAF)");
    }

    const rows = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll("div.py-2.px-6"));
      return elements.map((el) => {
        return { html_block: el.outerHTML };
      });
    });

    console.log(`Scraped ${rows.length} raw HTML blocks.`);

    await postJson(WEBHOOK_URL, {
      ok: true,
      source: "downdetector.gr",
      timestamp: new Date().toISOString(),
      data: rows,
    });

    console.log("Success. Data sent to n8n.");
    return { success: true, message: "Scraping completed and webhook sent." };

  } catch (err) {
    console.error("Error detected:", err.message);

    let screenshotBase64 = null;
    let pageTitle = "Unknown";
    let pageContentShort = "";

    if (page) {
        try {
            screenshotBase64 = await page.screenshot({ encoding: "base64", fullPage: false });
            pageTitle = await page.title();
            const content = await page.content();
            pageContentShort = content.slice(0, 1000); 
        } catch (screenshotErr) {
            console.error("Could not take screenshot:", screenshotErr);
        }
    }

    const errorPayload = {
      ok: false,
      source: "downdetector.gr",
      timestamp: new Date().toISOString(),
      error: err.message,
      debug: { title: pageTitle, html_preview: pageContentShort, screenshot_base64: screenshotBase64 }
    };

    try {
      await postJson(WEBHOOK_URL, errorPayload);
      console.log("Error report sent to webhook.");
    } catch (e) {
      console.error("Failed to send error webhook:", e);
    }
    
    // Πετάμε το error για να το πιάσει το Express endpoint
    throw err; 

  } finally {
    if (browser) await browser.close();
  }
}

// --- EXPRESS SERVER SETUP ---
const app = express();
const PORT = process.env.PORT || 3000;

// Απλό endpoint για να βλέπεις ότι ο server είναι ζωντανός (Healthcheck)
app.get("/", (req, res) => {
  res.send("Downdetector API is running!");
});

//
app.get("/scrape", async (req, res) => {
  try {
    // Ξεκινάει το scraping
    const result = await runScraper();
    //200 OK
    res.status(200).json(result);
  } catch (error) {
    //500 Error
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});