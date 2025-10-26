import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { execSync } = require('child_process');

// Типізація для puppeteer
type Browser = any;

// Ініціалізація stealth плагіну
puppeteer.use(StealthPlugin());

let sharedBrowser: Browser | null = null;
let lastActivityTime: number = 0;
let cleanupTimer: NodeJS.Timeout | null = null;

const BROWSER_TIMEOUT = 50000; // 50 секунд
const CLEANUP_INTERVAL = 10000; // Перевірка кожні 10 секунд

// Рандомні затримки
const randomDelay = (min: number, max: number) => 
  new Promise(resolve => setTimeout(resolve, min + Math.random() * (max - min)));

// Агресивне очищення тимчасових файлів
const aggressiveCleanup = () => {
  try {
    console.log('[Disk Cleanup] Starting aggressive cleanup...');
    
    // Очищення всіх Puppeteer файлів
    const cleanupCommands = [
      'rm -rf /tmp/puppeteer*',
      'rm -rf /tmp/.com.google.Chrome*',
      'rm -rf /tmp/chrome*',
      'rm -rf /tmp/chromium*',
      'rm -rf /var/tmp/puppeteer*',
      'rm -rf /var/tmp/.com.google.Chrome*',
      'rm -rf /var/tmp/chrome*',
      'rm -rf /var/tmp/chromium*',
      'find /tmp -name "*puppeteer*" -type d -exec rm -rf {} + 2>/dev/null || true',
      'find /tmp -name "*chrome*" -type d -exec rm -rf {} + 2>/dev/null || true',
      'find /var/tmp -name "*puppeteer*" -type d -exec rm -rf {} + 2>/dev/null || true',
      'find /var/tmp -name "*chrome*" -type d -exec rm -rf {} + 2>/dev/null || true'
    ];
    
    cleanupCommands.forEach(cmd => {
      try {
        execSync(cmd, { stdio: 'ignore', timeout: 5000 });
      } catch (e) {
        // Ігноруємо помилки очищення
      }
    });
    
    // Примусовий garbage collection
    if (global.gc) {
      global.gc();
    }
    
    console.log('[Disk Cleanup] Aggressive cleanup completed');
  } catch (error) {
    console.log('[Disk Cleanup] Error during cleanup:', error.message);
  }
};

// Моніторинг використання диску
const checkDiskUsage = () => {
  try {
    const result = execSync('df -h /tmp | tail -1', { encoding: 'utf8' });
    const usage = result.split(/\s+/)[4]; // Використання в %
    const usageNum = parseInt(usage.replace('%', ''));
    
    if (usageNum > 80) {
      console.log(`[Disk Monitor] High disk usage: ${usage}, triggering cleanup`);
      aggressiveCleanup();
    }
    
    return usageNum;
  } catch (error) {
    return 0;
  }
};

// Рандомні User-Agent та Viewport
const getUserAgent = () => {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
};

const getViewport = () => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 }
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
};

// Рандомні дії користувача
const performRandomActions = async (page: any) => {
  try {
    // Рандомний скрол
    await page.evaluate(() => {
      window.scrollBy(0, Math.random() * 200 - 100);
    });
    await randomDelay(500, 1500);

    // Рандомний рух миші
    await page.mouse.move(
      Math.random() * 800 + 100,
      Math.random() * 600 + 100,
      { steps: Math.floor(Math.random() * 10) + 5 }
    );
    await randomDelay(300, 800);

    // Рандомний клік в безпечному місці
    await page.click('body', { 
      button: 'left',
      clickCount: 1,
      delay: Math.random() * 100 + 50
    });
    await randomDelay(200, 600);

    // Рандомне натискання клавіш
    const keys = ['Tab', 'Escape', 'ArrowUp', 'ArrowDown'];
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    await page.keyboard.press(randomKey);
    await randomDelay(200, 500);

  } catch (error) {
    // Ігноруємо помилки рандомних дій
  }
};

// Людські затримки - більш реалістичні
const humanDelay = () => randomDelay(2000, 8000); // 2-8 секунд
const typingDelay = () => randomDelay(50, 200); // 50-200мс між символами
const thinkingDelay = () => randomDelay(1000, 4000); // 1-4 секунди "думки"

// Імітація людської поведінки
const simulateHumanBehavior = async (page: any) => {
  try {
    // Випадкова пауза "думки"
    await thinkingDelay();
    
    // Рандомний скрол
    await page.evaluate(() => {
      window.scrollBy(0, Math.random() * 300 - 150);
    });
    await randomDelay(800, 2000);

    // Рандомний рух миші з людською траєкторією
    const startX = Math.random() * 800 + 100;
    const startY = Math.random() * 600 + 100;
    const endX = Math.random() * 800 + 100;
    const endY = Math.random() * 600 + 100;
    
    // Рух по кривій (людська траєкторія)
    const steps = Math.floor(Math.random() * 15) + 8;
    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const curveX = startX + (endX - startX) * progress + Math.sin(progress * Math.PI) * 50;
      const curveY = startY + (endY - startY) * progress + Math.cos(progress * Math.PI) * 30;
      
      await page.mouse.move(curveX, curveY, { steps: 1 });
      await randomDelay(20, 80);
    }
    
    // Випадковий клік в безпечному місці
    await page.click('body', { 
      button: 'left',
      clickCount: 1,
      delay: Math.random() * 150 + 50
    });
    await randomDelay(300, 1000);

    // Випадкове натискання клавіш (як людина що думає)
    const thinkingKeys = ['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    const randomKey = thinkingKeys[Math.floor(Math.random() * thinkingKeys.length)];
    await page.keyboard.press(randomKey);
    await randomDelay(200, 800);

  } catch (error) {
    // Ігноруємо помилки рандомних дій
  }
};

/**
 * Отримує спільний браузер або створює новий
 */
export async function getBrowser(): Promise<Browser> {
  const now = Date.now();
  
  // Перевіряємо використання диску перед створенням браузера
  checkDiskUsage();
  
  // Якщо браузер існує і працює - оновлюємо час активності
  if (sharedBrowser && sharedBrowser.isConnected()) {
    lastActivityTime = now;
    console.log('[Puppeteer] Reusing existing browser');
    return sharedBrowser;
  }

  // Якщо браузер не існує або не працює - очищаємо і створюємо новий
  console.log('[Puppeteer] Creating new browser');
  
  // Закриваємо старий браузер якщо існує
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
    } catch (e) {
      // Ігноруємо помилки
    }
    sharedBrowser = null;
  }
  
  // Очищення та GC перед створенням нового
  aggressiveCleanup();
  if (global.gc) {
    global.gc();
  }
  
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
      '--disable-background-mode',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-features=VizDisplayCompositor',
      '--memory-pressure-off',
      '--max_old_space_size=128',
      '--disk-cache-size=0',
      '--aggressive-cache-discard',
      '--memory-pressure-off',
      '--max-old-space-size=128',
      '--disable-background-networking',
      '--disable-software-rasterizer',
      '--disable-gpu',
      '--disable-canvas-aa',
      '--disable-2d-canvas-clip-aa',
      '--disable-gl-drawing-for-tests',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-sync',
      '--disable-background-networking',
      '--disable-component-extensions-with-background-pages',
      '--disable-features=site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--single-process',
      `--user-agent=${getUserAgent()}`
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
          // Очищення після закриття
          aggressiveCleanup();
          // Примусовий GC
          if (global.gc) {
            global.gc();
          }
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
  
  // Агресивне очищення після закриття браузера
  aggressiveCleanup();
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

/**
 * Налаштовує сторінку з рандомними параметрами
 */
export const setupPage = async (page: any) => {
  const viewport = getViewport();
  await page.setViewport(viewport);
  
  // Додаткові налаштування для обходу детекції
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
    
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
    
    Object.defineProperty(navigator, 'permissions', {
      get: () => ({
        query: () => Promise.resolve({ state: 'granted' }),
      }),
    });
    
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
    });
    
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });
    
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
    });
    
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: () => 0,
    });
    
    // Видаляємо автоматизаційні глобальні змінні
    delete (window as any).chrome;
    delete (window as any).__nightmare;
    delete (window as any).__puppeteer;
    delete (window as any).callPhantom;
    delete (window as any)._phantom;
    delete (window as any).phantom;
  });
};

/**
 * Перевіряє чи сторінка заблокована
 */
export const checkForBlocking = async (page: any): Promise<boolean> => {
  try {
    // Перевіряємо на чорний екран або "Just a moment"
    const blockingTexts = [
      'Just a moment',
      'Please wait',
      'Checking your browser',
      'Security check',
      'Access denied',
      'Blocked',
      'Suspended'
    ];
    
    const pageContent = await page.content();
    const hasBlockingText = blockingTexts.some(text => 
      pageContent.toLowerCase().includes(text.toLowerCase())
    );
    
    if (hasBlockingText) {
      console.log('[Anti-Detection] Blocking detected, waiting...');
      await randomDelay(5000, 10000);
      return true;
    }
    
    // Перевіряємо на відсутність основних елементів Twitter
    const hasTwitterElements = await page.evaluate(() => {
      return document.querySelector('[data-testid="primaryColumn"]') !== null ||
             document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') !== null ||
             document.querySelector('input[name="text"]') !== null;
    });
    
    if (!hasTwitterElements) {
      console.log('[Anti-Detection] Twitter elements not found, possible blocking');
      return true;
    }
    
    return false;
  } catch (error) {
    console.log('[Anti-Detection] Error checking for blocking:', error.message);
    return true; // В разі помилки вважаємо що заблоковано
  }
};

// Імітація людського друкування
const humanType = async (page: any, selector: string, text: string) => {
  await page.focus(selector);
  await thinkingDelay(); // Пауза перед початком друкування
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Випадкова помилка (як людина)
    if (Math.random() < 0.05) { // 5% шанс помилки
      const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
      await page.keyboard.type(wrongChar);
      await typingDelay();
      await page.keyboard.press('Backspace');
      await typingDelay();
    }
    
    await page.keyboard.type(char);
    await typingDelay();
    
    // Випадкова пауза (як людина думає)
    if (Math.random() < 0.1) { // 10% шанс паузи
      await thinkingDelay();
    }
  }
};

// Відвідування випадкових сторінок Twitter
const visitRandomTwitterPages = async (page: any) => {
  const pages = [
    'https://twitter.com/home',
    'https://twitter.com/explore',
    'https://twitter.com/notifications',
    'https://twitter.com/messages',
    'https://twitter.com/i/bookmarks'
  ];
  
  const randomPage = pages[Math.floor(Math.random() * pages.length)];
  
  try {
    await page.goto(randomPage, { waitUntil: 'networkidle2' });
    await humanDelay();
    await simulateHumanBehavior(page);
  } catch (error) {
    // Ігноруємо помилки
  }
};

/**
 * Виконує рандомні дії для імітації користувача
 */
export { 
  performRandomActions, 
  randomDelay, 
  simulateHumanBehavior, 
  humanDelay, 
  typingDelay, 
  thinkingDelay,
  humanType,
  visitRandomTwitterPages,
  aggressiveCleanup,
  checkDiskUsage
};
