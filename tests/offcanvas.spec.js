// tests/offcanvas.spec.js — ровно те четыре сценария, которые я обещал проверять
// в переписке с заказчиком, плюс срез приёмочной матрицы (6 ширин × 3 браузера).
//
// Почему так, а не «посмотрел глазами»: поведение offcanvas ломается не в happy path,
// а на краях — при закрытии во время transition, при смене ширины в открытом состоянии,
// при переходе по маршруту в SPA. Каждое утверждение ниже проверяется ассертом,
// поэтому регресс ловится прогоном, а не на приёмке у заказчика.
const { test, expect } = require('@playwright/test');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const WIDTHS = [360, 390, 576, 768, 1024, 1440];
const MOBILE = 390;
const DESKTOP = 1024;

async function openPanel(page) {
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('#appSidebar')).toHaveClass(/show/);
}

async function residue(page) {
  return page.evaluate(() => ({
    backdrops: document.querySelectorAll('.offcanvas-backdrop').length,
    bodyOverflow: document.body.style.overflow || '',
    ariaModal: document.querySelector('#appSidebar').getAttribute('aria-modal'),
    role: document.querySelector('#appSidebar').getAttribute('role'),
    isDialogVisible: (() => {
      const el = document.querySelector('#appSidebar');
      return el.classList.contains('show');
    })(),
  }));
}

test.describe('shell — responsive offcanvas', () => {
  test('3.1 Acceptance matrix slice: shell renders at every width, toggle only exists in mobile mode', async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 820 });
      await page.goto(URL);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('#appSidebar')).toHaveCount(1); // одна разметка, не две копии меню
      const expectToggle = width < 768;
      expect(await page.locator('#sidebarToggle').isVisible(), `toggle at ${width}px`).toBe(expectToggle);
    }
  });

  test('3.2 Focus: stays inside while open, Escape closes, focus returns to the trigger', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE, height: 820 });
    await page.goto(URL);
    await openPanel(page);

    // Фокус внутри панели сразу после открытия.
    // ВАЖНО: через expect.poll, а не одним чтением. Bootstrap доводит фокус ПОСЛЕ перехода
    // (замер: 200 мс — класс `showing`, фокус ещё на кнопке; 600 мс — фокус в панели),
    // поэтому одиночная проверка сразу после класса `show` — гонка, а не дефект продукта.
    await expect.poll(
      () => page.evaluate(() => document.querySelector('#appSidebar').contains(document.activeElement)),
      { message: 'фокус должен оказаться внутри панели' },
    ).toBe(true);

    // Tab и Shift+Tab не должны выводить фокус за пределы панели.
    const escapes = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press(i % 4 === 3 ? 'Shift+Tab' : 'Tab');
      const inside = await page.evaluate(() => document.querySelector('#appSidebar').contains(document.activeElement));
      if (!inside) escapes.push(await page.evaluate(() => (document.activeElement || {}).outerHTML?.slice(0, 90) || 'null'));
    }
    expect(escapes, 'фокус вышел за пределы панели').toEqual([]);

    // Esc закрывает (keyboard: true по умолчанию).
    await page.keyboard.press('Escape');
    await expect(page.locator('#appSidebar')).not.toHaveClass(/show/);
    // Фокус возвращается на элемент, который открыл панель (тоже с ожиданием: возврат
    // происходит на `hidden`, то есть после завершения перехода).
    await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('sidebarToggle');
  });

  test('3.3 Backdrop: click closes the panel, and no backdrop survives the close', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE, height: 820 });
    await page.goto(URL);
    await openPanel(page);
    await expect(page.locator('.offcanvas-backdrop')).toHaveCount(1);

    // Клик — по точке, которая ЗАВЕДОМО вне панели: панель шириной 260 px занимает левый
    // край, а 390 px — ширина окна в этом тесте. Первая версия кликала в (8,8), то есть
    // по самой панели, и тест падал на здоровом коде.
    await page.locator('.offcanvas-backdrop').click({ position: { x: 330, y: 400 } });
    await expect(page.locator('#appSidebar')).not.toHaveClass(/show/);
    await expect(page.locator('.offcanvas-backdrop')).toHaveCount(0);
    expect((await residue(page)).bodyOverflow).toBe('');
  });

  test('3.4 Navigation: a menu click closes the panel and leaves no residue', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE, height: 820 });
    await page.goto(URL);
    await openPanel(page);

    await page.locator('#sidebarNav a[data-route="#/dashboard/settings"]').click();
    await expect(page.locator('#appSidebar')).not.toHaveClass(/show/);
    await expect(page).toHaveURL(/#\/dashboard\/settings$/);
    await expect(page.locator('h1')).toHaveText('Settings');
    // Breadcrumbs строятся из метаданных маршрута, а не из разметки страницы.
    await expect(page.locator('#breadcrumbs')).toContainText('Dashboard');
    await expect(page.locator('#breadcrumbs')).toContainText('Settings');

    const r = await residue(page);
    expect(r.backdrops, 'осталась подложка после навигации').toBe(0);
    expect(r.bodyOverflow, 'скролл остался заблокированным').toBe('');
  });

  test('3.5 Mobile → desktop switch: instance is disposed, no stuck backdrop or scroll lock', async ({ page }) => {
    await page.setViewportSize({ width: MOBILE, height: 820 });
    await page.goto(URL);
    await openPanel(page);

    // Смена ширины В ОТКРЫТОМ состоянии — именно этот кейс ломает адаптивный offcanvas.
    await page.setViewportSize({ width: DESKTOP, height: 820 });
    await page.waitForTimeout(600);

    const r = await residue(page);
    expect(r.isDialogVisible, 'на десктопе панель не должна оставаться открытым диалогом').toBe(false);
    expect(r.backdrops, 'подложка пережила смену брейкпоинта').toBe(0);
    expect(r.bodyOverflow, 'scroll-lock пережил смену брейкпоинта').toBe('');
    expect(r.ariaModal, 'на статичном сайдбаре не должно быть aria-modal').toBeNull();
    expect(r.role, 'на статичном сайдбаре не должно быть role=dialog').toBeNull();

    // И обратный переход: панель снова становится диалогом только когда её открыли.
    await page.setViewportSize({ width: MOBILE, height: 820 });
    await page.waitForTimeout(400);
    await expect(page.locator('#appSidebar')).not.toHaveClass(/show/);
    await openPanel(page);
    await expect(page.locator('#appSidebar')).toHaveClass(/show/);
  });
});
