// app.js — оболочка дашборда: route registry, breadcrumbs из метаданных маршрута,
// offcanvas-меню и уборка после смены брейкпоинта.
//
// ЧТО ЗДЕСЬ ПРИНЦИПИАЛЬНО (и почему это стоит показать заказчику):
//
// 1. Route registry — единственный источник правды. Меню, breadcrumbs и заголовок
//    строятся из него, а не дублируются в разметке. Именно это в ТЗ названо
//    «переиспользование принятой базы»: добавление маршрута = одна запись.
//
// 2. Bootstrap Offcanvas НЕ закрывается сам при навигации. Это не наша выдумка:
//    у offcanvas нет никакой связи с роутером, поэтому в SPA панель остаётся открытой
//    поверх новой страницы. Закрытие вешаем на событие маршрута (см. onRouteChange).
//
// 3. Смена mobile/desktop — самое слабое место адаптивного offcanvas. Класс
//    `offcanvas-md` переключает разметку, но подложка (.offcanvas-backdrop),
//    блокировка скролла на <body> и aria-modal/role="dialog" при этом остаются
//    «прилипшими», если панель была открыта в момент изменения ширины. Поэтому есть
//    явная функция reconcileBreakpoint(), а не надежда на фреймворк.
//
// 4. Focus trap. В Bootstrap 5.3.3 offcanvas удерживает фокус сам — это не догадка,
//    а факт из исходника (`dist/js/bootstrap.esm.js`: класс `Offcanvas` вызывает
//    `this._focustrap = this._initializeFocusTrap()` сразу в конструкторе). Дефолты там же:
//    backdrop: true, keyboard: true, scroll: false. На 5.0–5.2 этого не было, поэтому
//    версия в проекте фиксируется, а поведение проверяется тестом, а не верой.

const ROUTES = [
  { path: '#/dashboard', label: 'Dashboard', crumbs: ['Dashboard'], title: 'Dashboard' },
  { path: '#/dashboard/overview', label: 'Overview', crumbs: ['Dashboard', 'Overview'], title: 'Overview' },
  { path: '#/dashboard/profile', label: 'Profile', crumbs: ['Dashboard', 'Profile'], title: 'Profile' },
  { path: '#/dashboard/profile/professional', label: 'Professional profile', crumbs: ['Dashboard', 'Profile', 'Professional'], title: 'Professional profile' },
  { path: '#/dashboard/work-contexts', label: 'Work contexts', crumbs: ['Dashboard', 'Work contexts'], title: 'Work contexts' },
  { path: '#/dashboard/settings', label: 'Settings', crumbs: ['Dashboard', 'Settings'], title: 'Settings' },
];

const DEFAULT_ROUTE = ROUTES[0].path;
const DESKTOP_MIN = '(min-width: 768px)';

const $ = (sel) => document.querySelector(sel);
const sidebarEl = $('#appSidebar');
const navEl = $('#sidebarNav');
const crumbsEl = $('#breadcrumbs');
const viewEl = $('#routeView');
const toggleEl = $('#sidebarToggle');

const offcanvasOf = () => bootstrap.Offcanvas.getOrCreateInstance(sidebarEl);

/** Единственное место, где мы «следуем» за фреймворком при смене ширины. */
function reconcileBreakpoint() {
  const isDesktop = window.matchMedia(DESKTOP_MIN).matches;
  const hint = $('#viewportHint');
  if (hint) hint.textContent = isDesktop ? 'desktop: static sidebar' : 'mobile: offcanvas';

  if (!isDesktop) return; // на мобиле offcanvas живёт по своим правилам
  // Перешли в desktop-режим: панель обязана стать статичной колонкой, без следов диалога.
  // hide() нужен до снятия классов: иначе остаётся подложка и блокировка скролла.
  const inst = bootstrap.Offcanvas.getInstance(sidebarEl);
  if (inst && sidebarEl.classList.contains('show')) inst.hide();
  document.querySelectorAll('.offcanvas-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('offcanvas-open', 'modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
  sidebarEl.removeAttribute('aria-modal');
  sidebarEl.removeAttribute('role');
  sidebarEl.style.removeProperty('visibility');
}

function renderNav() {
  navEl.innerHTML = ROUTES.map((r) => `
    <a class="nav-link" href="${r.path}" data-route="${r.path}">${r.label}</a>`).join('');
}

function renderCrumbs(route) {
  crumbsEl.innerHTML = route.crumbs
    .map((c, i) => `<li class="breadcrumb-item${i === route.crumbs.length - 1 ? ' active' : ''}">${c}</li>`)
    .join('');
}

function renderRoute() {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const route = ROUTES.find((r) => r.path === hash) || ROUTES[0];
  renderCrumbs(route);
  document.title = `${route.title} — Dashboard Shell demo`;
  viewEl.innerHTML = `
    <h1 class="h4">${route.title}</h1>
    <p class="text-secondary">Route <code>${route.path}</code> rendered from the route registry.</p>
    <div class="card"><div class="card-body">
      <p class="mb-1">Content is a placeholder: the point of this demo is the shell, not the pages.</p>
      <p class="mb-0 qa-hint">Six routes × three browsers × six widths — the acceptance matrix from the brief maps to Playwright projects and viewport presets.</p>
    </div></div>`;
  navEl.querySelectorAll('a[data-route]').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === route.path);
    if (a.dataset.route === route.path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/** Закрытие панели при навигации — то, чего Bootstrap сам не делает. */
function onRouteChange() {
  const inst = bootstrap.Offcanvas.getInstance(sidebarEl);
  if (inst && sidebarEl.classList.contains('show')) inst.hide();
  renderRoute();
}

window.addEventListener('hashchange', onRouteChange);
renderNav();
if (!window.location.hash) window.location.replace(DEFAULT_ROUTE);
renderRoute();
window.addEventListener('resize', reconcileBreakpoint);
window.matchMedia(DESKTOP_MIN).addEventListener('change', reconcileBreakpoint);
reconcileBreakpoint();

// Уборка «хвостов» после закрытия панели: Bootstrap снимает класс .show, но подложка
// и блокировка скролла иногда переживают закрытие (особенно при закрытии во время
// transition). Фокус возвращаем на триггер — это требование доступности, а не вкус.
sidebarEl.addEventListener('hidden.bs.offcanvas', () => {
  document.body.style.removeProperty('overflow');
  document.querySelectorAll('.offcanvas-backdrop').forEach((el) => el.remove());
  sidebarEl.removeAttribute('aria-modal');
  if (!window.matchMedia(DESKTOP_MIN).matches && toggleEl) toggleEl.focus();
});

// Фокус после открытия. Замер (Firefox, 06.10, три точки 200/600/1200 мс): Bootstrap сам
// доводит фокус в панель (`trapElement.focus()` из FocusTrap), но только после перехода —
// на 200 мс класс ещё `showing` и активна кнопка меню, на 600 мс активна сама панель.
// Значит падать может только тот, кто проверяет фокус сразу — что и делал наш тест (гонка).
// Обработчик ниже не заменяет Bootstrap, а страхует случай «после `shown` фокуса в панели
// всё равно нет» (например, если панель опустеет или разметка поменяется).
sidebarEl.addEventListener('shown.bs.offcanvas', () => {
  if (sidebarEl.contains(document.activeElement)) return;
  const first = sidebarEl.querySelector('.offcanvas-body a[href], .offcanvas-body button')
    || sidebarEl.querySelector('button:not(.btn-close)');
  (first || sidebarEl).focus();
});
