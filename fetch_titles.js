const puppeteer = require('puppeteer');

async function getTitle(url) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    // Try to find article H1
    const h1 = await page.evaluate(() => {
      const h1s = document.querySelectorAll('h1');
      return Array.from(h1s).map(h => h.textContent.trim());
    });
    console.log(url);
    console.log('H1s:', JSON.stringify(h1));
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await browser.close();
  }
}

(async () => {
  await getTitle('https://help.salesforce.com/s/articleView?id=xcloud.os_version_omniscripts.htm&type=5');
  await getTitle('https://help.salesforce.com/s/articleView?id=xcloud.os_add_an_action_to_a_flexcard_25672.htm&type=5');
})();
