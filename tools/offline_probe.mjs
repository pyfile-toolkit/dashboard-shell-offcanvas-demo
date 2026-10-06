// Самопроверка автономности демо: страница и панель должны работать, когда ЛЮБОЙ внешний
// запрос заблокирован. Иначе «спека зелёная» означает «в момент прогона был доступен CDN»,
// а не «оболочка работает».
//
// Запуск: node tools/offline_probe.mjs
// Требует playwright-core (приходит вместе с @playwright/test из devDependencies).
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEMO = 'file://' + path.resolve(here, '..', 'index.html');
const EXEC = process.env.CHROMIUM_PATH; // необязательно: свой исполняемый файл

const b = await chromium.launch(EXEC ? { executablePath: EXEC, args: ['--no-sandbox'] } : {});
const p = await b.newPage({ viewport: { width: 430, height: 800 } });

const external = [];
await p.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('file://')) return route.continue();
  external.push(url);
  return route.abort();
});

await p.goto(DEMO, { waitUntil: 'load', timeout: 30000 });
await p.waitForTimeout(1500);
const before = await p.evaluate(() => ({
  stylesheets: document.styleSheets.length,
  bootstrapJs: typeof window.bootstrap !== 'undefined',
  activeNavBackground: getComputedStyle(document.querySelector('.nav-pills .active')).backgroundColor,
}));

await p.locator('#sidebarToggle').click({ timeout: 5000 });
await p.waitForTimeout(1000);
const after = await p.evaluate(() => ({
  panelShown: document.querySelector('#appSidebar').classList.contains('show'),
  backdrop: !!document.querySelector('.offcanvas-backdrop'),
}));
await b.close();

const ok = external.length === 0 && before.stylesheets >= 2 && before.bootstrapJs && after.panelShown && after.backdrop;
console.log(JSON.stringify({ externalRequestsAttempted: external, before, afterClick: after, selfContained: ok }, null, 1));
process.exit(ok ? 0 : 1);
