import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Ініціалізація stealth плагіну
puppeteer.use(StealthPlugin());

let sharedBrowser: puppeteer.Browser | null = null;
let lastActivityTime: number = 0;
let cleanupTimer: NodeJS.Timeout | null = null;

const BROWSER_TIMEOUT = 50000; // 50 секунд
const CLEANUP_INTERVAL = 10000; // Перевірка кожні 10 секунд

/**
 * Отримує спільний браузер або створює новий
 */
export async function getBrowser(): Promise<puppeteer.Browser> {
  const now = Date.now();
  
  // Якщо браузер існує і працює - оновлюємо час активності
  if (sharedBrowser && sharedBrowser.isConnected()) {
    lastActivityTime = now;
    console.log('[Puppeteer] Reusing existing browser');
    return sharedBrowser;
  }

  // Якщо браузер не існує або не працює - створюємо новий
  console.log('[Puppeteer] Creating new browser');
  
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
  
  sharedBrowser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-web-security',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=site-per-process',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-client-side-phishing-detection',
      '--disable-sync',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-background-networking',
      '--disable-component-extensions-with-background-pages',
      '--disable-features=TranslateUI',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-prompt-on-repost',
      '--disable-domain-reliability',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
  });

  lastActivityTime = now;
  
  // Запускаємо таймер очищення
  startCleanupTimer();
  
  return sharedBrowser;
}

/**
 * Запускає таймер для автоматичного закриття браузера
 */
function startCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  cleanupTimer = setInterval(async () => {
    const now = Date.now();
    
    if (sharedBrowser && sharedBrowser.isConnected()) {
      const idleTime = now - lastActivityTime;
      
      if (idleTime > BROWSER_TIMEOUT) {
        console.log('[Puppeteer] Browser idle for 50+ seconds, closing...');
        try {
          await sharedBrowser.close();
          sharedBrowser = null;
          lastActivityTime = 0;
        } catch (error) {
          console.error('[Puppeteer] Error closing browser:', error.message);
          sharedBrowser = null;
        }
      }
    } else {
      // Браузер не працює - очищуємо
      sharedBrowser = null;
      lastActivityTime = 0;
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Примусово закриває браузер
 */
export async function closeBrowser(): Promise<void> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    console.log('[Puppeteer] Force closing browser');
    try {
      await sharedBrowser.close();
    } catch (error) {
      console.error('[Puppeteer] Error force closing browser:', error.message);
    }
  }
  
  sharedBrowser = null;
  lastActivityTime = 0;
  
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Отримує інформацію про стан браузера
 */
export function getBrowserStatus(): { 
  isConnected: boolean; 
  idleTime: number; 
  lastActivity: number 
} {
  const now = Date.now();
  const idleTime = now - lastActivityTime;
  
  return {
    isConnected: sharedBrowser ? sharedBrowser.isConnected() : false,
    idleTime: Math.max(0, idleTime),
    lastActivity: lastActivityTime
  };
}
