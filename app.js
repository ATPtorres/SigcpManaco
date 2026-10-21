"use strict";
const $ = (s, root = document) => root.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4Z M3 7l9 4 9-4 M12 11v10 M7 5l10 4"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4Z M3 12l9 4 9-4 M3 17l9 4 9-4"/>',
  orders: '<path d="M8 4H5v17h14V4h-3 M9 2h6v4H9Z M8 11h8 M8 15h8"/>',
  flow: '<rect x="3" y="4" width="4" height="16"/><rect x="10" y="4" width="4" height="10"/><rect x="17" y="4" width="4" height="13"/>',
  alert: '<path d="m12 3 10 18H2Z M12 9v5 M12 17v1"/>',
  chart: '<path d="M3 3v18h18 M7 16v-5 M12 16V6 M17 16V9"/>',
  settings:
    '<path d="M4 6h16 M4 12h16 M4 18h16"/><rect x="7" y="4" width="3" height="4"/><rect x="14" y="10" width="3" height="4"/><rect x="8" y="16" width="3" height="4"/>',
  book: '<path d="M12 5v16 M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-6-2-10 1Z"/>',
  plus: '<path d="M12 5v14 M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  down: '<path d="M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5"/>',
  arrow: '<path d="M4 12h16 m-6-6 6 6-6 6"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3Z M10 21h4"/>',
  factory: '<path d="M3 21V10l6 3V8l6 4V3h4l2 18Z M6 17h2 M11 17h2 M16 17h2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  edit: '<path d="m14 5 5 5 M3 21l5-1L21 7l-5-5L3 15Z"/>',
  shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z m-5 10 4 4 6-7"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${icons[name] || icons.box}</svg>`;
const states = [
  "Pendiente",
  "En producción",
  "Control de calidad",
  "Terminado",
  "Despachado",
];
const routes = {
  dashboard: ["Vista general", "grid"],
  orders: ["Órdenes de producción", "orders"],
  tracking: ["Seguimiento", "flow"],
  products: ["Productos", "box"],
  materials: ["Materiales", "layers"],
  incidents: ["Incidencias", "alert"],
  reports: ["Reportes", "chart"],
  project: ["Proyecto y piloto", "book"],
  inventory: ["Lotes y reservas", "layers"],
  workers: ["Trabajadores", "book"],
  budgets: ["Presupuestos", "chart"],
  catalogs: ["Catálogos", "settings"],
  users: ["Usuarios y permisos", "shield"],
  settings: ["Datos y respaldo", "settings"],
  guide: ["Guía de uso", "book"],
};
const LEGACY_KEY = "sigcp-manaco-v1";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (value) =>
  value
    ? new Intl.DateTimeFormat("es-BO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value.length === 10 ? value + "T12:00:00" : value))
    : "—";
const num = (value) =>
  new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 }).format(value);
const shiftDate = (n) => {
  const d = new Date(today() + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
let db = {
  version: 2,
  mode: "own",
  products: [],
  materials: [],
  orders: [],
  incidents: [],
  audit: [],
  movements: [],
  pilot: {},
  refs: {
    units: [],
    lines: [],
    sizes: [],
    colors: [],
    models: [],
    stages: [],
    locations: [],
  },
  workers: [],
  lots: [],
  fichas: [],
  budgets: [],
  labor: [],
  reservations: [],
};
let currentUser = null;
let route = "dashboard",
  query = "",
  statusFilter = "",
  reportFrom = "",
  reportTo = "",
  toastTimer;
async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw Error(data.error || "No se pudo completar la operación.");
  }
  return data;
}
async function loadState() {
  const data = await api("/api/state");
  db = data;
  document.body.classList.remove("signed-out");
  if (!currentUser) currentUser = (await api("/api/session")).user;
  $(".user-name").innerHTML =
    esc(currentUser.name) + "<small>" + esc(currentUser.role) + "</small>";
  render();
}
function showLogin() {
  currentUser = null;
  if ($("#sidebar").classList.contains("is-open")) setNavigation(false, false);
  if ($("#modal").open) closeModal();
  document.body.classList.add("signed-out");
  $("#main").innerHTML =
    `<section class="auth-card"><div class="eyebrow">SIGCP / MANACO</div><h1>Acceso al sistema</h1><p>Gestión de fabricación e inventario compartido.</p><form id="login-form"><label class="field">Usuario<input name="username" autocomplete="username" required maxlength="80"></label><label class="field">Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="200"></label><p id="login-error" role="alert"></p><button class="btn primary" type="submit">Iniciar sesión</button></form></section>`;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      const d = Object.fromEntries(new FormData(e.target));
      currentUser = (
        await api("/api/login", { method: "POST", body: JSON.stringify(d) })
      ).user;
      await loadState();
    } catch (error) {
      if ($("#login-error")) $("#login-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
async function bootstrap() {
  try {
    await loadState();
  } catch (error) {
    if (!$("#login-form")) {
      showLogin();
      $("#login-error").textContent =
        "No se pudo conectar con el servidor. Comprueba el backend y MySQL y vuelve a intentar.";
    }
  }
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("toast-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => $("#toast").classList.remove("toast-visible"),
    4500,
  );
}
const product = (id) => db.products.find((p) => p.id === id);
const lowStock = () =>
  db.materials.filter((m) => m.activo && m.stock - m.reserved <= m.min);
const openIncidents = () => db.incidents.filter((i) => i.status !== "Resuelta");
const badge = (s) => `<span class="tag s${s}">${states[s]}</span>`;
const priority = (p) =>
  `<span class="priority ${p === "Alta" ? "" : "normal"}"><i></i>${esc(p)}</span>`;
const button = (label, action, ico = "plus", style = "primary") =>
  `<button class="btn ${style}" data-action="${action}">${icon(ico)}${label}</button>`;
function heading(title, subtitle, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">PRODUCCIÓN / ${esc(route === "dashboard" ? "CENTRO DE CONTROL" : routes[route][0].toUpperCase())}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
function kpi(label, value, unit, foot, ico, alert = false) {
  return `<article class="kpi ${alert ? "alert" : ""}"><div class="kpi-head">${label}<span class="kpi-icon">${icon(ico)}</span></div><div class="kpi-value">${value}<small>${unit}</small></div><div class="kpi-foot">${foot}</div></article>`;
}
function render() {
  route = location.hash.slice(1).split("?")[0] || "dashboard";
  if (!routes[route]) route = "dashboard";
  $("#breadcrumb").textContent = routes[route][0];
  document.title = routes[route][0] + " · MANACO";
  $(".pilot-label").innerHTML =
    '<span class="live-dot"></span> ' +
    (db.mode === "demo"
      ? "ENTORNO DE DEMOSTRACIÓN"
      : "DATOS COMPARTIDOS · MYSQL");
  $(".local-status").innerHTML = "<i></i> MySQL";
  $("#navigation").innerHTML = Object.entries(routes)
    .filter(
      ([key]) =>
        key !== "guide" &&
        (key !== "users" || currentUser?.role === "Administrador"),
    )
    .map(
      ([key, [label, ico]]) =>
        `<a href="#${key}" class="${route === key ? "active " : ""}${key === "project" ? "nav-separator" : ""}" ${route === key ? 'aria-current="page"' : ""}>${icon(ico)}${label}${key === "incidents" && openIncidents().length ? `<span class="nav-count">${openIncidents().length}</span>` : ""}</a>`,
    )
    .join("");
  $("#main").innerHTML = {
    dashboard: dashboard,
    orders: ordersView,
    tracking: trackingView,
    products: productsView,
    materials: materialsView,
    incidents: incidentsView,
    reports: reportsView,
    project: projectView,
    inventory: inventoryView,
    workers: workersView,
    budgets: budgetsView,
    catalogs: catalogsView,
    users: usersView,
    settings: settingsView,
    guide: guideView,
  }[route]();
  $("#main").classList.remove("view-enter");
  void $("#main").offsetWidth;
  $("#main").classList.add("view-enter");
  applyPermissions($("#main"));
}
function dashboard() {
  const active = db.orders.filter((o) => o.state < 3),
    done = db.orders.filter((o) => o.state >= 3),
    total = db.orders.reduce((a, o) => a + o.quantity, 0),
    finished = done.reduce((a, o) => a + o.acceptedPairs, 0),
    unmeasured = done.filter((o) => !o.acceptedKnown),
    closedPlan = done.reduce((sum, o) => sum + o.quantity, 0);
  return (
    heading(
      "Vista general",
      "Cada etapa conectada. Cada decisión, con información.",
      button("Exportar reporte", "export-orders", "down", "") +
        button("Nueva orden", "new-order"),
    ) +
    `<section class="overview-banner"><div><div class="eyebrow">GESTIÓN INDUSTRIAL DE CALZADO</div><h2>El pulso de tu producción.</h2><p>Supervisa órdenes, anticipa faltantes y mantén el trabajo en movimiento.</p></div><div class="banner-side"><div class="banner-date"><span>COCHABAMBA, BOLIVIA</span><strong>${date(today())}</strong></div><svg class="factory-art" viewBox="0 0 120 90" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M4 78h111M13 75V37l25 13V30l27 16V13h12l6 62M13 75h94V39L83 50M65 13h12M65 20h13M23 59h8v9h-8zM43 59h8v9h-8zM64 59h8v9h-8zM89 59h8v9h-8zM17 85h90"/><path d="M69 7V3m8 3 3-3"/></svg></div></section>` +
    `<section class="kpis" aria-label="Indicadores de producción">${kpi("Órdenes activas", num(active.length), "órdenes", `<b>${db.orders.filter((o) => o.state === 1).length} en producción</b> · ${db.orders.filter((o) => o.state === 0).length} pendientes`, "orders")}${kpi("Pares conformes medidos", unmeasured.length === done.length && done.length ? "Sin dato" : num(finished), "pares", unmeasured.length ? `${unmeasured.length} cierres heredados sin conteo de calidad` : `${num(total)} pares planificados en total`, "box")}${kpi("Plan cerrado", total ? Math.round((closedPlan / total) * 100) + "%" : "—", "", `${done.length} de ${db.orders.length} órdenes terminadas`, "chart")}${kpi("Requieren atención", lowStock().length + openIncidents().length, "alertas", `<b>${lowStock().length} materiales bajo mínimo</b> · ${openIncidents().length} incidencias`, "alert", true)}</section>` +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Producción por modelo</h2><p class="panel-subtitle">Plan y pares conformes medidos</p></div><div class="chart-legend"><span><i class="key"></i>Planificado</span><span><i class="key red"></i>Conformes</span></div></div>${productionChart()}<div class="chart-bottom"><span>${db.mode === "demo" ? "Datos de demostración" : "Datos compartidos"} · Todas las órdenes</span><a class="text-link" href="#reports">Ver análisis ${icon("arrow")}</a></div></section><section class="panel"><div class="panel-head"><div><h2>Centro de atención</h2><p class="panel-subtitle">Lo que necesita una decisión</p></div><span class="tag danger">${lowStock().length + openIncidents().length} alertas</span></div><div class="alert-list">${alertsHTML()}</div><div class="panel-foot"><span>Anticiparse también es producir.</span><a class="text-link" href="#incidents">Ver incidencias →</a></div></section></div>` +
    `<section class="panel"><div class="panel-head table-heading"><div><h2>Órdenes de producción</h2><p class="panel-subtitle">Seguimiento de los lotes más recientes</p></div><a class="text-link" href="#orders">Ver todas las órdenes →</a></div>${orderTable([...db.orders].reverse().slice(0, 5))}</section>`
  );
}
function productionChart() {
  const rows = db.products.slice(0, 6).map((p) => ({
    name: p.name.split(" ")[0],
    plan: db.orders
      .filter((o) => o.product === p.id)
      .reduce((a, o) => a + o.quantity, 0),
    done: db.orders
      .filter((o) => o.product === p.id && o.state >= 3)
      .reduce((a, o) => a + o.acceptedPairs, 0),
  }));
  const max = Math.max(100, ...rows.map((r) => r.plan));
  return `<div class="chart" role="img" aria-label="${esc(rows.map((r) => r.name + ": " + r.plan + " planificados, " + r.done + " finalizados").join(". "))}"><div class="axis"><span>${num(max)}</span><span>${num(Math.round((max * 2) / 3))}</span><span>${num(Math.round(max / 3))}</span><span>0</span></div><div class="bar-area">${rows.map((r) => `<div class="bar-column" title="${esc(r.name)}: ${r.plan} planificados / ${r.done} finalizados"><div class="bar" style="--height:${(r.plan / max) * 100}%"></div><div class="bar actual" style="--height:${(r.done / max) * 100}%"></div><span class="bar-label">${esc(r.name)}</span></div>`).join("")}</div></div>`;
}
function alertsHTML() {
  const items = [
    ...lowStock().map((m) => ({
      title: m.name,
      text: `${num(m.stock)} ${m.unit} disponibles · mínimo ${num(m.min)}`,
      link: "materials",
      label: "Revisar existencias",
    })),
    ...openIncidents().map((i) => ({
      title: i.type,
      text: i.order + " · " + i.status,
      link: "incidents",
      label: "Revisar incidencia",
    })),
  ].slice(0, 3);
  return items.length
    ? items
        .map(
          (a) =>
            `<div class="alert-item"><div class="alert-icon">${icon("alert")}</div><div><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><a class="text-link" href="#${a.link}">${a.label} →</a></div></div>`,
        )
        .join("")
    : '<div class="empty">Sin alertas pendientes.</div>';
}
function orderTable(orders) {
  return `<div class="table-wrap" tabindex="0"><table><thead><tr><th>ORDEN / PRODUCTO</th><th>CANTIDAD</th><th>ESTADO</th><th>AVANCE</th><th>ENTREGA</th><th>PRIORIDAD</th><th scope="col">Acciones</th></tr></thead><tbody>${orders.map((o) => `<tr><td><button class="order-id" data-action="detail" data-id="${o.id}">${esc(o.numero_orden)}</button><small>${esc(product(o.product)?.name)} · T${esc(o.size)}</small></td><td><strong>${num(o.quantity)}</strong> pares</td><td>${badge(o.state)}</td><td><span class="progress"><span style="width:${o.state * 25}%"></span></span><span class="progress-num">${o.state * 25}%</span></td><td>${date(o.due)}${o.due < today() && o.state < 3 ? '<small style="color:var(--red)">Entrega vencida</small>' : ""}</td><td>${priority(o.priority)}</td><td><button class="icon-button" data-action="detail" data-id="${o.id}" aria-label="Ver ${esc(o.numero_orden)}">${icon("arrow")}</button></td></tr>`).join("") || '<tr><td colspan="7"><div class="empty">No hay órdenes para esta búsqueda.</div></td></tr>'}</tbody></table></div>`;
}
function toolbar(placeholder, options = []) {
  return `<div class="toolbar"><label class="search-box">${icon("search")}<input id="search" type="search" value="${esc(query)}" placeholder="${placeholder}" aria-label="${placeholder}"></label><div class="filters">${options.length ? `<select id="status-filter" aria-label="Filtrar registros"><option value="">Todos los registros</option>${options.map((v, i) => `<option value="${esc(v)}" ${statusFilter === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : ""}<span class="result-count" id="result-count"></span></div></div>`;
}
const matches = (...values) =>
  values.join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase());
function filteredOrders() {
  return db.orders.filter(
    (o) =>
      matches(
        o.id,
        o.numero_orden,
        product(o.product)?.name,
        o.owner,
        o.size,
      ) &&
      (!statusFilter || states[o.state] === statusFilter),
  );
}
function ordersView() {
  return (
    heading(
      "Órdenes de producción",
      "Planifica lotes, asigna responsables y controla cada entrega.",
      button("Exportar CSV", "export-orders", "down", "") +
        button("Nueva orden", "new-order"),
    ) +
    toolbar("Buscar orden, producto o responsable…", states) +
    `<section class="panel" id="results">${orderTable(filteredOrders())}</section>`
  );
}
function trackingView() {
  return (
    heading(
      "Seguimiento de producción",
      "De la planificación al despacho, con un historial en cada etapa.",
      button("Nueva orden", "new-order"),
    ) +
    `<div class="note">El inicio de producción descuenta los materiales de la receta. Para terminar una orden, resuelve sus incidencias y registra la evidencia de control de calidad.</div><div class="kanban">${states
      .map(
        (s, index) =>
          `<section class="kanban-column"><h2 class="kanban-header">${s}<span>${db.orders
            .filter((o) => o.state === index)
            .length.toString()
            .padStart(2, "0")}</span></h2>${
            db.orders
              .filter((o) => o.state === index)
              .map(
                (o) =>
                  `<article class="kanban-card"><div class="kanban-meta"><button class="order-id" data-action="detail" data-id="${o.id}">${esc(o.numero_orden)}</button>${priority(o.priority)}</div><h3>${esc(product(o.product)?.name)}</h3><p>${num(o.quantity)} pares · Talla ${esc(o.size)}</p><div class="kanban-meta"><span>${esc(o.owner)}</span><span>${date(o.due)}</span></div><button class="btn small" data-action="detail" data-id="${o.id}">Ver orden ${icon("arrow")}</button></article>`,
              )
              .join("") || '<div class="empty">Sin órdenes</div>'
          }</section>`,
      )
      .join("")}</div>`
  );
}
function shoe(tone) {
  return `<svg class="shoe" viewBox="0 0 280 150" aria-hidden="true"><path d="M33 94c9-6 16-34 20-49l30 17 35-8 37 27c18 9 34 13 59 16 20 3 35 11 36 23H33Z" fill="${tone}"/><path d="m53 45 30 17 35-8-15 19-29 4Z" fill="#fff" opacity=".15"/><path d="M33 112c54 7 143 10 217 2v14c-54 10-151 6-217-1Z" fill="#fdfdfd" stroke="#b6bec8" stroke-width="1.5"/><path d="M35 128c60 9 150 12 213 0" stroke="#9ba6b3" stroke-width="4"/><path d="m111 69 22-3 m-14 10 22-3 m-13 10 22-3 m-12 10 21-3" stroke="#e7e8e7" stroke-width="3"/><path d="M62 76c-6 13-10 22-12 30m114-13c-8 4-12 11-12 19" stroke="#fff" opacity=".25" fill="none"/><path d="M43 117h190" stroke="#d0d7dd" stroke-dasharray="3 4"/></svg>`;
}
function productCards() {
  const list = db.products.filter(
    (p) =>
      matches(p.id, p.name, p.category, p.color) &&
      (!statusFilter || p.category === statusFilter),
  );
  return (
    list
      .map(
        (p) =>
          `<article class="product-card"><div class="product-art"><span class="product-code">${esc(p.sku)} / COLECCIÓN MANACO</span>${shoe(p.tone)}</div><div class="product-body"><span class="eyebrow">${esc(p.category)} / ${esc(p.color)}</span><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p><p>Tallas ${esc(p.sizes)}<br>${p.bom.length} materiales en la receta</p><div class="product-footer"><span class="result-count">${db.orders.filter((o) => o.product === p.id).length} órdenes registradas</span><button class="text-link" data-action="edit-product" data-id="${p.id}">Editar / versionar →</button><button class="text-link" data-action="ficha-detail" data-id="${p.id}">Ver fichas</button></div></div></article>`,
      )
      .join("") || '<div class="empty">No se encontraron productos.</div>'
  );
}
function productsView() {
  return (
    heading(
      "Catálogo de productos",
      "Modelos, tallas y recetas de materiales en un solo lugar.",
      button("Nuevo producto", "new-product"),
    ) +
    toolbar("Buscar modelo, código o color…", [
      "Formal",
      "Casual",
      "Deportivo",
      "Escolar",
      "Industrial",
    ]) +
    `<div class="product-grid" id="results">${productCards()}</div>`
  );
}
function materialsTable() {
  const list = db.materials.filter(
    (m) =>
      matches(m.id, m.codigo, m.name) &&
      (!statusFilter ||
        (statusFilter === "Bajo mínimo" ? m.stock <= m.min : m.stock > m.min)),
  );
  return `<div class="table-wrap" tabindex="0"><table><thead><tr><th>MATERIAL</th><th>EXISTENCIAS</th><th>NIVEL MÍNIMO</th><th>UNIDAD</th><th>DISPONIBILIDAD</th><th>ACCIONES</th></tr></thead><tbody>${list.map((m) => `<tr><td><strong>${esc(m.name)}</strong><small>${esc(m.codigo)}</small></td><td>${num(m.stock)}<div class="stock-track ${m.stock <= m.min ? "low" : ""}"><span style="width:${Math.min(100, (m.stock / Math.max(1, m.min * 3)) * 100)}%"></span></div></td><td>${num(m.min)}</td><td>${esc(m.unit)}</td><td><span class="tag ${m.stock <= m.min ? "danger" : "s3"}">${m.stock <= m.min ? "Bajo mínimo" : "Disponible"}</span></td><td><div class="row-actions"><button class="btn small" data-action="stock" data-id="${m.id}">Movimiento</button><button class="icon-button" data-action="edit-material" data-id="${m.id}" aria-label="Editar ${esc(m.name)}">${icon("edit")}</button></div></td></tr>`).join("") || '<tr><td colspan="6"><div class="empty">No hay materiales para esta búsqueda.</div></td></tr>'}</tbody></table></div>`;
}
function materialsView() {
  return (
    heading(
      "Control de materiales",
      "Existencias visibles para una producción sin interrupciones.",
      button("Exportar CSV", "export-materials", "down", "") +
        button("Nuevo material", "new-material"),
    ) +
    `<div class="kpis">${kpi("Materiales registrados", db.materials.length, "referencias", "Catálogo de insumos y componentes", "layers")}${kpi("Bajo nivel mínimo", lowStock().length, "materiales", "Revisión de reposición necesaria", "alert", true)}${kpi("Con disponibilidad", db.materials.length - lowStock().length, "materiales", "Existencias por encima del mínimo", "check")}${kpi("Movimientos", db.movements.length, "registros", "Entradas y salidas trazables", "flow")}</div>` +
    toolbar("Buscar material o código…", ["Disponible", "Bajo mínimo"]) +
    `<section class="panel" id="results">${materialsTable()}</section>` +
    `<section class="panel section-gap"><div class="panel-head"><h2>Últimos movimientos</h2></div><div class="activity">${
      db.movements
        .slice(0, 8)
        .map(
          (m) =>
            `<div class="activity-item">${esc(db.materials.find((x) => x.id === m.material)?.name)} · ${m.amount > 0 ? "+" : ""}${num(m.amount)} · ${esc(m.reason)}<small>${date(m.at)} · Área de producción</small></div>`,
        )
        .join("") ||
      '<p class="panel-subtitle">Los nuevos movimientos de inventario aparecerán aquí.</p>'
    }</div></section>`
  );
}
function incidentsTable() {
  const list = db.incidents.filter(
    (i) =>
      matches(
        i.id,
        i.codigo,
        i.order,
        i.numero_orden,
        i.type,
        i.description,
        i.owner,
      ) &&
      (!statusFilter || i.status === statusFilter),
  );
  return `<div class="table-wrap" tabindex="0"><table><thead><tr><th>INCIDENCIA / ORDEN</th><th>TIPO Y DESCRIPCIÓN</th><th>SEVERIDAD</th><th>RESPONSABLE</th><th>ESTADO</th><th scope="col">Acciones</th></tr></thead><tbody>${list.map((i) => `<tr><td><strong>${esc(i.codigo)}</strong><small>${esc(i.numero_orden)}</small></td><td><strong>${esc(i.type)}</strong><small style="white-space:normal;max-width:300px;line-height:1.6">${esc(i.description)}</small></td><td>${priority(i.severity)}</td><td>${esc(i.owner)}</td><td><span class="tag ${i.status === "Resuelta" ? "s3" : "danger"}">${esc(i.status)}</span></td><td><button class="btn small" data-action="edit-incident" data-id="${i.id}">Gestionar →</button></td></tr>`).join("") || '<tr><td colspan="6"><div class="empty">No hay incidencias para esta búsqueda.</div></td></tr>'}</tbody></table></div>`;
}
function incidentsView() {
  return (
    heading(
      "Gestión de incidencias",
      "Registra lo ocurrido. Asigna una solución. Conserva la evidencia.",
      button("Registrar incidencia", "new-incident"),
    ) +
    toolbar("Buscar incidencia, orden o responsable…", [
      "Abierta",
      "En atención",
      "Resuelta",
    ]) +
    `<section class="panel" id="results">${incidentsTable()}</section>`
  );
}
function reportOrders() {
  return db.orders.filter(
    (o) =>
      (!reportFrom || o.created >= reportFrom) &&
      (!reportTo || o.created <= reportTo),
  );
}
function reportsView() {
  const rows = reportOrders(),
    closed = rows.filter((o) => o.state >= 3),
    onTime = closed.filter((o) => o.closed && o.closed <= o.due),
    pairs = rows.reduce((a, o) => a + o.quantity, 0),
    ids = new Set(rows.map((o) => o.id)),
    inc = db.incidents.filter((i) => ids.has(i.order)),
    resolved = inc.filter((i) => i.status === "Resuelta");
  return (
    heading(
      "Reportes y control",
      "Indicadores calculados a partir de tus registros de producción.",
      button("Imprimir / PDF", "print", "down", "") +
        button("Exportar CSV", "export-report", "down"),
    ) +
    `<div class="toolbar"><div class="filters"><label class="field">Creación desde<input id="report-from" type="date" value="${reportFrom}"></label><label class="field">Hasta<input id="report-to" type="date" value="${reportTo}"></label><button class="btn" data-action="filter-report">Aplicar período</button><button class="text-link" data-action="clear-report">Todo el historial</button></div><span class="result-count">${rows.length} órdenes en el período</span></div><div class="print-only"><p>Reporte SIGCP MANACO · ${date(today())} · ${reportFrom || "Inicio"} a ${reportTo || "hoy"} · ${db.mode === "demo" ? "Datos de demostración" : "Datos compartidos"}</p></div><div class="kpis">${kpi("Volumen planificado", num(pairs), "pares", "Suma de cantidades del período", "box")}${kpi("Órdenes finalizadas", closed.length, "de " + rows.length, "Terminadas o despachadas", "check")}${kpi("Cumplimiento de fechas", closed.length ? Math.round((onTime.length / closed.length) * 100) + "%" : "—", "", closed.length ? "Órdenes terminadas en fecha / cerradas" : "No medido · sin órdenes cerradas", "clock")}${kpi("Incidencias resueltas", inc.length ? Math.round((resolved.length / inc.length) * 100) + "%" : "—", "", `${resolved.length} de ${inc.length} incidencias del período`, "alert")}</div><div class="report-grid"><section class="panel"><div class="panel-head"><h2>Distribución por estado</h2></div><div class="report-list">${states.map((s, i) => `<div class="report-row"><span>${s}</span><strong>${rows.filter((o) => o.state === i).length} órdenes</strong></div>`).join("")}</div></section><section class="panel"><div class="panel-head"><h2>Lectura operativa</h2></div><div class="report-list"><div class="report-row"><span>Órdenes vencidas del período</span><strong>${rows.filter((o) => o.state < 3 && o.due < today()).length}</strong></div><div class="report-row"><span>Materiales bajo mínimo · inventario actual</span><strong>${lowStock().length}</strong></div><div class="report-row"><span>Tiempo medio de resolución</span><strong>${resolved.length ? num(resolved.reduce((sum, i) => sum + (new Date(i.closed) - new Date(i.created)) / 86400000, 0) / resolved.length) + " días" : "No medido"}</strong></div><div class="report-row"><span>Exactitud física de inventario</span><strong>No medido</strong></div><div class="report-row"><span>Adopción de usuarios</span><strong>No medido</strong></div></div></section></div><section class="panel section-gap"><div class="panel-head table-heading"><h2>Detalle de órdenes del período</h2></div>${orderTable(rows)}</section>`
  );
}
const pilotItems = [
  "Alcance del piloto aprobado",
  "Usuarios y responsables definidos",
  "Productos y materiales iniciales depurados",
  "Órdenes de prueba seleccionadas",
  "Casos de prueba ejecutados",
  "Defectos críticos resueltos",
  "Accesos y respaldos verificados",
  "Usuarios capacitados",
  "Indicadores y metas definidos",
  "Decisión de continuidad documentada",
];
function projectView() {
  const costs = [
    ["Análisis y requerimientos", 4000],
    ["Diseño del sistema", 4500],
    ["Desarrollo del sistema", 12000],
    ["Pruebas y correcciones", 3500],
    ["Implementación y configuración", 3000],
    ["Capacitación", 1500],
    ["Infraestructura", 2500],
    ["Documentación", 1000],
    ["Contingencia", 2500],
  ];
  return (
    heading(
      "Proyecto y piloto",
      "Marco de implementación y criterios de aceptación del informe.",
    ) +
    `<div class="note">Propuesta académica · ULAT 2026. El presupuesto es referencial y requiere validación con MANACO. Esta lista registra evidencias; no sustituye la aprobación del comité responsable.</div><div class="guide-grid">${[
      [
        "01",
        "Semanas 1–2",
        "Diagnóstico y requerimientos",
        "Proceso, actores, historias priorizadas y alcance aprobado.",
      ],
      [
        "02",
        "Semanas 3–4",
        "Diseño funcional y visual",
        "Interfaces, modelo de datos y reglas de estados validadas.",
      ],
      [
        "03",
        "Semanas 5–6",
        "Desarrollo e integración",
        "Productos, materiales, órdenes, seguimiento, incidencias y reportes.",
      ],
      [
        "04",
        "Semanas 7–8",
        "Pruebas, piloto y cierre",
        "Capacitación, ejecución del piloto y evaluación de resultados.",
      ],
    ]
      .map(
        (s) =>
          `<article class="guide-card"><span class="step-number">S${s[0]}</span><div class="eyebrow">${s[1]}</div><h2>${s[2]}</h2><p>${s[3]}</p></article>`,
      )
      .join(
        "",
      )}</div><div class="report-grid section-gap"><section class="panel"><div class="panel-head"><h2>Preparación del piloto</h2><span class="tag s1">${Object.values(db.pilot).filter((x) => x.checked).length} / 10</span></div><div class="report-list">${pilotItems.map((item, i) => `<div class="check-row"><span>${db.pilot[i]?.checked ? icon("check") : icon("clock")}</span><div style="flex:1">${item}<small>${esc(db.pilot[i]?.evidence || "Pendiente de validar")}</small></div><button class="text-link" data-action="pilot" data-id="${i}">Registrar</button></div>`).join("")}</div></section><section class="panel"><div class="panel-head"><h2>Presupuesto del proyecto · referencia</h2><span class="tag s0">BOB</span></div><div class="report-list">${costs.map((c) => `<div class="report-row"><span>${c[0]}</span><strong>Bs ${num(c[1])}</strong></div>`).join("")}<div class="report-row"><span>Total estimado</span><strong>Bs 34.500</strong></div><p class="panel-subtitle">Línea base: Bs 32.000 · Contingencia: Bs 2.500<br>Costos reales y beneficios: no medidos.</p></div></section></div>`
  );
}
function settingsView() {
  return (
    heading("Datos y respaldo", "Información compartida almacenada en MySQL.") +
    `<div class="note">Las operaciones se validan en el servidor y se guardan en una base de datos común. Usa Actualizar para consultar cambios de otras sesiones. Los datos del antiguo navegador no se importan ni se borran automáticamente.</div><div class="guide-grid"><article class="guide-card"><h2>Exportar datos de negocio</h2><p>Descarga las tablas de fabricación, inventario, costos, historial y piloto. El archivo no incluye contraseñas ni sesiones.</p>${button("Descargar exportación", "backup", "down", "navy")}</article><article class="guide-card"><h2>Respaldo y restauración MySQL</h2><p>Para un respaldo completo y una restauración controlada, utiliza las herramientas de MySQL con el procedimiento del administrador. La interfaz no permite borrar ni sustituir toda la base.</p>${button("Exportar datos del navegador anterior", "legacy-export", "down", "")}</article><article class="guide-card"><h2>Migrar respaldo anterior</h2><p>Selecciona un JSON del prototipo. Revisarás las cantidades y advertencias antes de añadirlo; no se borran datos existentes.</p><label class="field">Archivo del prototipo<input id="legacy-file" type="file" accept="application/json,.json"></label></article></div><section class="panel section-gap"><div class="panel-head"><h2>Migraciones realizadas</h2></div><div class="activity">${(db.imports || []).map((i) => `<div class="activity-item">${esc(i.etiqueta)}<small>${date(i.fecha_hora)} · ${esc(i.actor)} · ${i.resumen.orders} órdenes</small></div>`).join("") || "<p>Sin importaciones.</p>"}</div></section><section class="panel section-gap"><div class="panel-head"><h2>Bitácora del servidor</h2></div><div class="activity">${db.audit.map((a) => `<div class="activity-item">${esc(a.text)}<small>${date(a.at)} · ${esc(a.actor)}</small></div>`).join("") || "<p>Sin operaciones registradas.</p>"}</div></section>`
  );
}
function guideView() {
  return (
    heading(
      "Guía de uso",
      "Un circuito de información, desde los materiales hasta la entrega.",
    ) +
    `<div class="guide-grid">${[
      [
        "01",
        "Prepara el catálogo",
        "Prepara unidades, líneas, tallas, colores, modelos, etapas y ubicaciones en Catálogos. Registra materiales y trabajadores. Crea productos con SKU y ficha de fabricación.",
      ],
      [
        "02",
        "Planifica una orden",
        "Selecciona producto y talla, cantidad de pares, fechas, prioridad y responsable. La orden comienza en estado Pendiente.",
      ],
      [
        "03",
        "Inicia la producción",
        "Abre la orden y avanza de estado. El sistema verifica la receta completa y descuenta los materiales una sola vez. Si faltan existencias, registra una entrada en Materiales.",
      ],
      [
        "04",
        "Controla calidad e incidencias",
        "Lleva la orden a Control de calidad. Registra fallas y asigna responsables. Para terminar, resuelve todas sus incidencias y escribe evidencia de calidad; luego podrás despachar.",
      ],
      [
        "05",
        "Consulta y exporta",
        "Filtra órdenes y reportes. Exporta los registros a CSV o utiliza Imprimir / PDF para generar un documento con el diálogo del navegador.",
      ],
      [
        "06",
        "Respalda el trabajo",
        "En Datos y respaldo exporta los datos de negocio. El administrador conserva respaldos MySQL completos. La bitácora registra el usuario de cada operación.",
      ],
    ]
      .map(
        (s) =>
          `<article class="guide-card"><span class="step-number">${s[0]}</span><h2>${s[1]}</h2><p>${s[2]}</p></article>`,
      )
      .join(
        "",
      )}</div><div class="note section-gap">Las operaciones se guardan en MySQL mediante el servidor. Cada orden conserva su ficha versionada. Las etapas consumen materiales por lote y ubicación, y las reservas reducen el saldo disponible.</div>`
  );
}
function showModal(title, html) {
  $("#modal-title").textContent = title;
  $("#modal-content").innerHTML = html;
  $("#modal").showModal();
  applyPermissions($("#modal"));
}
function closeModal() {
  $("#modal").close();
}
const field = (
  label,
  name,
  value = "",
  type = "text",
  extra = "",
  full = false,
) =>
  `<label class="field ${full ? "full" : ""}">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const selectField = (label, name, values, current = "", full = false) =>
  `<label class="field ${full ? "full" : ""}">${label}<select name="${name}" required>${values
    .map((v) => {
      const pair = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(pair[0])}" ${String(pair[0]) === String(current) ? "selected" : ""}>${esc(pair[1])}</option>`;
    })
    .join("")}</select></label>`;
const textarea = (label, name, value = "", required = true) =>
  `<label class="field full">${label}<textarea name="${name}" maxlength="1000" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
function formHTML(content, label = "Guardar registro") {
  return `<form id="record-form"><div class="form-grid">${content}</div><div class="form-error" id="form-error" role="alert"></div><div class="form-footer"><button type="button" class="btn" data-action="close">Cancelar</button><button class="btn primary" type="submit">${label} ${icon("check")}</button></div></form>`;
}
function bindForm(handler) {
  $("#record-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target,
      submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    $("#form-error").textContent = "";
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (error) {
      if ($("#form-error")) $("#form-error").textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
}
const asId = (value) =>
  Number(String(value).replace(/^(MAT|PRD|OP|INC|MOV)-/, ""));
const refOptions = (type, id, label = "nombre") =>
  db.refs[type].map((r) => [r[id], r[label]]);
const activeWorkers = () =>
  db.workers
    .filter((w) => w.estado === "Activo")
    .map((w) => [w.trabajador_id, w.nombre_completo]);
async function command(path, data, message, method = "POST") {
  await api(path, { method, body: JSON.stringify(data) });
  closeModal();
  try {
    await loadState();
    toast(message);
  } catch (error) {
    toast(
      "La operación se confirmó, pero no se pudo actualizar la vista. Usa Actualizar.",
    );
  }
}
function requireOptions(list, message) {
  if (!list.length) {
    toast(message);
    return false;
  }
  return true;
}
function orderForm() {
  if (
    !requireOptions(
      db.products.filter((p) => p.activo),
      "Registra primero un producto activo en Productos.",
    ) ||
    !requireOptions(activeWorkers(), "Registra primero un trabajador activo.")
  )
    return;
  showModal(
    "Nueva orden de fabricación",
    formHTML(
      selectField(
        "Producto / talla / color",
        "producto_id",
        db.products
          .filter((p) => p.activo)
          .map((p) => [p.producto_id, p.sku + " · " + p.name]),
        "",
        true,
      ) +
        selectField("Responsable", "trabajador_id", activeWorkers(), "", true) +
        field(
          "Cantidad de pares",
          "cantidad_planificada",
          100,
          "number",
          'min="1" max="1000000" required',
        ) +
        selectField("Prioridad", "prioridad", ["Normal", "Alta"]) +
        field(
          "Inicio programado",
          "inicio_programado",
          today(),
          "date",
          "required",
        ) +
        field(
          "Fin programado",
          "fin_programado",
          shiftDate(7),
          "date",
          "required",
        ),
      "Crear orden",
    ),
  );
  bindForm((d) =>
    command("/api/orders", d, "Orden creada con su ficha y requerimientos."),
  );
}
function availability(o) {
  return o.requirements.map((r) => {
    const m = db.materials.find((m) => m.material_id === r.material_id);
    return {
      m,
      needed:
        r.cantidad_neta_por_par * (1 + r.porcentaje_merma / 100) * o.quantity,
      ok:
        !!m &&
        m.stock >=
          r.cantidad_neta_por_par * (1 + r.porcentaje_merma / 100) * o.quantity,
    };
  });
}
function detail(id) {
  const o = db.orders.find((o) => o.id === id);
  if (!o) return;
  showModal(
    "Orden " + o.numero_orden,
    `<div class="row-actions">${badge(o.state)}${priority(o.priority)}</div><div class="detail-grid"><div><small>Producto</small><strong>${esc(product(o.product)?.name)}</strong></div><div><small>Planificado</small><strong>${num(o.quantity)} pares</strong></div><div><small>Responsable</small><strong>${esc(o.owner)}</strong></div><div><small>Ficha / fechas</small><strong>#${o.ficha_id} · ${date(o.start)} → ${date(o.due)}</strong></div></div>${o.origen_datos === "Migrado" ? '<div class="note">Orden heredada: los consumos anteriores ya están reflejados en el saldo. Las horas de inicio y el desglose histórico por etapas no fueron registrados.</div>' : ""}<h3>Etapas de fabricación</h3><div class="activity">${o.etapas.map((e) => `<div class="activity-item"><strong>${e.secuencia}. ${esc(e.nombre)}</strong><p>${esc(e.estado)} · ${e.conteo_confirmado ? `Aceptados: ${num(e.cantidad_aceptada)} · Rechazados: ${num(e.cantidad_rechazada)}` : "Conteo histórico: no medido"}</p><div class="row-actions">${["Pendiente", "En producción"].includes(e.estado) && o.state < 3 ? `<button class="text-link" data-action="stage-incident" data-id="${e.detalle_etapa_id}">Registrar incidencia</button>` : ""}</div>${e.estado === "Pendiente" && o.state === 1 ? `<button class="btn small" data-action="start-stage" data-id="${e.detalle_etapa_id}">Iniciar ${esc(e.nombre)}</button>` : ""}${e.estado === "En producción" ? `<button class="btn small" data-action="finish-stage" data-id="${e.detalle_etapa_id}">Terminar ${esc(e.nombre)}</button>` : ""}</div>`).join("")}</div>${o.evidence ? `<div class="note">Evidencia de calidad: ${esc(o.evidence)}</div>` : ""}<h3>Trazabilidad</h3><div class="activity">${o.history.map((h) => `<div class="activity-item">${esc(h.text)}<small>${date(h.at)} · ${esc(h.actor)}</small></div>`).join("")}</div><div class="form-footer">${o.state < 4 ? `<button class="btn primary" data-action="advance" data-id="${o.id}">${["Iniciar producción", "Enviar a calidad", "Terminar orden", "Registrar despacho"][o.state]}</button>` : ""}</div>`,
  );
}
async function advance(id) {
  const o = db.orders.find((o) => o.id === id);
  if (!o || o.state >= 4) return;
  if (o.state === 2) {
    showModal(
      "Aprobación de calidad",
      formHTML(
        textarea("Evidencia de aprobación", "evidencia") +
          (!o.acceptedKnown
            ? field(
                "Pares aceptados observados",
                "cantidad_aceptada",
                "",
                "number",
                'min="0" required',
              ) +
              field(
                "Pares rechazados observados",
                "cantidad_rechazada",
                "",
                "number",
                'min="0" required',
              )
            : ""),
        "Aprobar y terminar",
      ),
    );
    bindForm((d) =>
      command(
        `/api/orders/${id}/advance`,
        {
          estado_esperado: states[o.state],
          evidencia: d.evidencia,
          ...(!o.acceptedKnown
            ? {
                cantidad_aceptada: Number(d.cantidad_aceptada),
                cantidad_rechazada: Number(d.cantidad_rechazada),
              }
            : {}),
        },
        "Orden terminada.",
      ),
    );
  } else
    await command(
      `/api/orders/${id}/advance`,
      { estado_esperado: states[o.state] },
      "Estado de orden actualizado.",
    );
}
function finishStageForm(id) {
  const o = db.orders.find((o) =>
    o.etapas.some((e) => e.detalle_etapa_id === Number(id)),
  );
  showModal(
    "Terminar etapa",
    formHTML(
      field(
        "Pares aceptados",
        "cantidad_aceptada",
        o.quantity,
        "number",
        'min="0" required',
      ) +
        field(
          "Pares rechazados",
          "cantidad_rechazada",
          0,
          "number",
          'min="0" required',
        ),
      "Terminar etapa",
    ),
  );
  bindForm((d) =>
    command(`/api/order-stages/${id}/finish`, d, "Etapa terminada."),
  );
}
let recipeRowCount = 0;
function recipeRow(data = {}) {
  const i = recipeRowCount++;
  return `<fieldset class="recipe-row" data-recipe-row="${i}"><legend>Etapa y consumo ${i + 1}</legend><div class="form-grid">${field("Secuencia", "seq_" + i, data.secuencia || i + 1, "number", 'min="1" required')}${selectField("Etapa", "stage_" + i, refOptions("stages", "etapa_id"), data.etapa_id)}${field("Minutos por par", "minutes_" + i, data.minutos_estimados_por_par || 0, "number", 'min="0" step="0.0001" required')}${field("Costo de mano de obra por par", "cost_" + i, data.costo_mano_obra_estimado_por_par || 0, "number", 'min="0" step="0.0001" required')}${selectField("Material", "material_" + i, [[0, "Sin material"], ...db.materials.filter((m) => m.activo).map((m) => [m.material_id, m.name + " · " + m.unit])], data.material_id || 0)}${field("Consumo neto por par", "qty_" + i, data.cantidad_neta_por_par || 0, "number", 'min="0" step="0.0001" required')}${field("Merma (%)", "waste_" + i, data.porcentaje_merma || 0, "number", 'min="0" max="100" step="0.0001" required')}</div><button type="button" class="text-link" data-action="remove-recipe">Quitar fila</button></fieldset>`;
}
function productForm(id) {
  if (
    !requireOptions(db.refs.models, "Crea un modelo en Catálogos.") ||
    !requireOptions(db.refs.stages, "Crea etapas en Catálogos.")
  )
    return;
  const p = db.products.find((p) => p.id === id);
  recipeRowCount = 0;
  const current = p?.ficha?.etapas.flatMap((e) =>
    e.materiales.length ? e.materiales.map((m) => ({ ...e, ...m })) : e,
  ) || [{}];
  showModal(
    p ? "Nueva versión de ficha" : "Nuevo producto y ficha",
    formHTML(
      field(
        "SKU",
        "sku",
        p?.sku || "",
        "text",
        'required maxlength="80"',
        true,
      ) +
        selectField(
          "Modelo",
          "modelo_id",
          db.refs.models.map((m) => [m.modelo_id, m.codigo + " · " + m.nombre]),
          p?.modelo_id,
          true,
        ) +
        selectField(
          "Talla",
          "talla_id",
          db.refs.sizes.map((t) => [t.talla_id, t.sistema + " " + t.valor]),
          p?.talla_id,
        ) +
        selectField(
          "Color",
          "color_id",
          refOptions("colors", "color_id"),
          p?.color_id,
        ) +
        selectField(
          "Estado",
          "activo",
          [
            [1, "Activo"],
            [0, "Inactivo"],
          ],
          p ? p.activo : 1,
        ) +
        `<div class="field full"><p>La misma secuencia agrupa materiales de una etapa. Cada edición crea una ficha nueva; las órdenes existentes conservan su versión.</p><div id="recipe-rows">${current.map(recipeRow).join("")}</div><button type="button" class="btn" data-action="add-recipe">Añadir etapa / material</button></div>`,
    ),
  );
  bindForm((d) => {
    const grouped = new Map();
    for (const row of document.querySelectorAll("[data-recipe-row]")) {
      const i = row.dataset.recipeRow,
        seq = Number(d["seq_" + i]),
        stage = {
          etapa_id: Number(d["stage_" + i]),
          secuencia: seq,
          minutos_estimados_por_par: Number(d["minutes_" + i]),
          costo_mano_obra_estimado_por_par: Number(d["cost_" + i]),
          materiales: [],
        };
      const old = grouped.get(seq);
      if (
        old &&
        (old.etapa_id !== stage.etapa_id ||
          old.minutos_estimados_por_par !== stage.minutos_estimados_por_par ||
          old.costo_mano_obra_estimado_por_par !==
            stage.costo_mano_obra_estimado_por_par)
      )
        throw Error(
          "Las filas de la misma secuencia deben tener la misma etapa, tiempo y costo.",
        );
      const e = old || stage;
      if (Number(d["material_" + i]))
        e.materiales.push({
          material_id: Number(d["material_" + i]),
          cantidad_neta_por_par: Number(d["qty_" + i]),
          porcentaje_merma: Number(d["waste_" + i]),
        });
      grouped.set(seq, e);
    }
    return command(
      "/api/products" + (id ? "/" + id : ""),
      {
        sku: d.sku,
        modelo_id: Number(d.modelo_id),
        talla_id: Number(d.talla_id),
        color_id: Number(d.color_id),
        activo: d.activo === "1",
        etapas: [...grouped.values()],
      },
      "Producto y ficha guardados.",
      id ? "PUT" : "POST",
    );
  });
}
function materialForm(id) {
  const m = db.materials.find((m) => m.id === id);
  showModal(
    m ? "Editar material" : "Nuevo material",
    formHTML(
      field(
        "Código",
        "codigo",
        m?.codigo || "",
        "text",
        'required maxlength="40"',
      ) +
        field(
          "Nombre",
          "nombre",
          m?.name || "",
          "text",
          'required maxlength="120"',
        ) +
        selectField(
          "Unidad",
          "unidad_id",
          db.refs.units.map((u) => [u.unidad_id, u.nombre + " · " + u.simbolo]),
          m?.unidad_id,
        ) +
        field(
          "Costo de referencia",
          "costo_referencia",
          m?.costo_referencia || 0,
          "number",
          'min="0" step="0.0001" required',
        ) +
        field(
          "Stock mínimo",
          "stock_minimo",
          m?.min || 0,
          "number",
          'min="0" step="0.0001" required',
        ) +
        selectField(
          "Estado",
          "activo",
          [
            [1, "Activo"],
            [0, "Inactivo"],
          ],
          m ? m.activo : 1,
        ) +
        textarea("Observación", "observacion", m?.observacion || "", false) +
        (!m
          ? field(
              "Saldo inicial",
              "stock_inicial",
              0,
              "number",
              'min="0" step="0.0001" required',
            ) +
            field(
              "Lote inicial",
              "codigo_lote",
              "INICIAL",
              "text",
              'required maxlength="80"',
            ) +
            selectField(
              "Ubicación",
              "ubicacion_id",
              db.refs.locations.map((l) => [
                l.ubicacion_id,
                l.codigo + " · " + l.descripcion,
              ]),
            )
          : ""),
    ),
  );
  bindForm((d) =>
    command(
      "/api/materials" + (id ? "/" + id : ""),
      { ...d, activo: d.activo === "1" },
      "Material guardado.",
      id ? "PUT" : "POST",
    ),
  );
}
function stockForm(id) {
  const m = db.materials.find((m) => m.id === id);
  showModal(
    "Movimiento de " + m.name,
    formHTML(
      selectField("Tipo", "tipo_movimiento", ["Entrada", "Salida"]) +
        field(
          "Cantidad",
          "cantidad",
          "",
          "number",
          'min="0.0001" step="0.0001" required',
        ) +
        field(
          "Código de lote",
          "codigo_lote",
          "",
          "text",
          'required maxlength="80"',
        ) +
        selectField(
          "Ubicación",
          "ubicacion_id",
          db.refs.locations.map((l) => [
            l.ubicacion_id,
            l.codigo + " · " + l.descripcion,
          ]),
        ) +
        field(
          "Costo unitario aplicado",
          "costo_unitario_aplicado",
          m.costo_referencia,
          "number",
          'min="0" step="0.0001" required',
        ) +
        textarea("Motivo", "motivo"),
    ),
  );
  bindForm((d) =>
    command(
      "/api/movements",
      { ...d, material_id: m.material_id },
      "Movimiento confirmado.",
    ),
  );
}
function incidentForm(id, stageId) {
  const i = db.incidents.find((i) => i.id === id);
  const options = db.orders
    .filter((o) => o.state < 3)
    .flatMap((o) =>
      o.etapas.map((e) => [
        e.detalle_etapa_id,
        o.numero_orden + " · " + e.secuencia + ". " + e.nombre,
      ]),
    );
  if (!requireOptions(options, "Necesitas una orden abierta con etapas."))
    return;
  showModal(
    i ? "Gestionar incidencia" : "Registrar incidencia",
    formHTML(
      selectField(
        "Orden y etapa",
        "detalle_etapa_id",
        options,
        i?.detalle_etapa_id || stageId,
        true,
      ) +
        field(
          "Tipo",
          "tipo",
          i?.type || "Problema de calidad",
          "text",
          'required maxlength="80"',
        ) +
        selectField(
          "Severidad",
          "severidad",
          ["Baja", "Media", "Alta"],
          i?.severity || "Media",
        ) +
        selectField(
          "Responsable",
          "responsable_id",
          activeWorkers(),
          i?.responsable_id,
          true,
        ) +
        textarea("Descripción", "descripcion", i?.description || "") +
        field(
          "Impacto estimado (opcional)",
          "costo_estimado_impacto",
          i?.costo_estimado_impacto ?? "",
          "number",
          'min="0" step="0.0001"',
        ) +
        selectField(
          "Estado",
          "estado",
          ["Abierta", "En atención", "Resuelta"],
          i?.status || "Abierta",
        ) +
        textarea("Resolución / acción", "resolucion", i?.action || "", false),
    ),
  );
  bindForm((d) =>
    command(
      "/api/incidents" + (id ? "/" + id : ""),
      {
        ...d,
        costo_estimado_impacto:
          d.costo_estimado_impacto === ""
            ? null
            : Number(d.costo_estimado_impacto),
      },
      "Incidencia guardada.",
      id ? "PUT" : "POST",
    ),
  );
}
function pilotForm(id) {
  const p = db.pilot[id];
  showModal(
    "Evidencia del piloto",
    formHTML(
      `<div class="note field full">${pilotItems[id]}</div>` +
        selectField(
          "Estado",
          "status",
          ["Pendiente", "Validado"],
          p?.checked ? "Validado" : "Pendiente",
          true,
        ) +
        textarea("Evidencia", "evidence", p?.evidence || ""),
    ),
  );
  bindForm((d) =>
    command(
      "/api/pilot/" + id,
      { checked: d.status === "Validado", evidence: d.evidence },
      "Evidencia guardada.",
      "PUT",
    ),
  );
}
function inventoryView() {
  return (
    heading(
      "Lotes y reservas",
      "Saldo por lote y ubicación; disponibilidad descontando reservas.",
      button("Reservar material", "new-reservation"),
    ) +
    tableView(
      ["Material", "Lote", "Ubicación", "Saldo", "Reservado", "Disponible"],
      db.lots.map((l) => [
        esc(db.materials.find((m) => m.material_id === l.material_id)?.name),
        esc(l.codigo_lote),
        esc(l.ubicacion),
        num(l.saldo),
        num(l.reservado),
        num(l.saldo - l.reservado),
      ]),
    ) +
    `<section class="section-gap"><h2>Reservas activas</h2>${tableView(
      ["Etapa de orden", "Existencia", "Cantidad", "Acciones"],
      db.reservations.map((r) => [
        esc(stageLabel(r.detalle_etapa_id)),
        String(r.existencia_id),
        num(r.cantidad_pendiente),
        `<button class="btn small" data-action="release-reservation" data-id="${r.reserva_id}">Liberar</button>`,
      ]),
    )}</section>`
  );
}
function tableView(headers, rows) {
  return `<div class="panel table-wrap section-gap" tabindex="0" role="group" aria-label="Tabla: ${esc(headers.join(", "))}"><table><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}">Sin registros.</td></tr>`}</tbody></table></div>`;
}
function stageLabel(id) {
  for (const o of db.orders) {
    const e = o.etapas.find((e) => e.detalle_etapa_id === id);
    if (e) return o.numero_orden + " · " + e.nombre;
  }
  return "—";
}
function reserveForm() {
  const stages = db.orders
    .filter((o) => o.state < 2)
    .flatMap((o) =>
      o.etapas
        .filter((e) => e.estado === "Pendiente")
        .map((e) => [e.detalle_etapa_id, o.numero_orden + " · " + e.nombre]),
    );
  if (
    !requireOptions(stages, "No hay etapas pendientes para reservar.") ||
    !requireOptions(db.lots, "Registra primero una entrada de inventario.")
  )
    return;
  showModal(
    "Reservar material",
    formHTML(
      selectField("Orden y etapa", "detalle_etapa_id", stages, "", true) +
        selectField(
          "Material / lote / ubicación",
          "existencia_id",
          db.lots.map((l) => [
            l.existencia_id,
            (db.materials.find((m) => m.material_id === l.material_id)?.name ||
              "") +
              " · " +
              l.codigo_lote +
              " · " +
              l.ubicacion,
          ]),
          "",
          true,
        ) +
        field(
          "Cantidad a reservar",
          "cantidad_pendiente",
          "",
          "number",
          'min="0.0001" step="0.0001" required',
          true,
        ),
    ),
  );
  bindForm((d) => command("/api/reservations", d, "Reserva confirmada."));
}
function workersView() {
  return (
    heading(
      "Trabajadores y mano de obra",
      "Especialidades, tarifas y horas realmente registradas.",
      button("Registrar horas", "new-labor", "clock", "") +
        button("Nuevo trabajador", "new-worker"),
    ) +
    tableView(
      [
        "Código",
        "Trabajador",
        "Contratación",
        "Tarifa / hora",
        "Especialidades",
        "Estado",
        "Acciones",
      ],
      db.workers.map((w) => [
        esc(w.codigo),
        esc(w.nombre_completo),
        esc(w.tipo_contratacion),
        w.tarifa_confirmada ? num(w.tarifa_hora_actual) : "Por confirmar",
        esc(
          w.etapas
            .map((id) => db.refs.stages.find((e) => e.etapa_id === id)?.nombre)
            .join(", "),
        ),
        esc(w.estado),
        `<button class="btn small" data-action="edit-worker" data-id="${w.trabajador_id}">Editar</button>`,
      ]),
    ) +
    `<section class="section-gap"><h2>Registro de horas</h2>${tableView(
      ["Fecha", "Trabajador", "Etapa", "Horas", "Tarifa aplicada", "Costo"],
      db.labor.map((r) => [
        date(r.fecha),
        esc(
          db.workers.find((w) => w.trabajador_id === r.trabajador_id)
            ?.nombre_completo,
        ),
        esc(stageLabel(r.detalle_etapa_id)),
        num(r.horas_trabajadas),
        num(r.tarifa_hora_aplicada),
        num(r.costo),
      ]),
    )}</section>`
  );
}
function workerForm(id) {
  const w = db.workers.find((w) => w.trabajador_id === Number(id));
  showModal(
    w ? "Editar trabajador" : "Nuevo trabajador",
    formHTML(
      field(
        "Código",
        "codigo",
        w?.codigo || "",
        "text",
        'required maxlength="40"',
      ) +
        field(
          "Nombre completo",
          "nombre_completo",
          w?.nombre_completo || "",
          "text",
          'required maxlength="120"',
        ) +
        field(
          "Tipo de contratación",
          "tipo_contratacion",
          w?.tipo_contratacion || "Dependiente",
          "text",
          'required maxlength="40"',
        ) +
        field(
          "Tarifa por hora",
          "tarifa_hora_actual",
          w?.tarifa_hora_actual || 0,
          "number",
          'min="0" step="0.0001" required',
        ) +
        selectField(
          "Estado",
          "estado",
          ["Activo", "Inactivo"],
          w?.estado || "Activo",
        ) +
        `<fieldset class="field full"><legend>Etapas habilitadas</legend>${db.refs.stages.map((e) => `<label class="choice"><input type="checkbox" name="skill_${e.etapa_id}" ${w?.etapas.includes(e.etapa_id) ? "checked" : ""}>${esc(e.nombre)}</label>`).join("")}</fieldset>`,
    ),
  );
  bindForm((d) => {
    const etapas = Object.keys(d)
      .filter((k) => k.startsWith("skill_"))
      .map((k) => Number(k.slice(6)));
    return command(
      "/api/workers" + (id ? "/" + id : ""),
      {
        codigo: d.codigo,
        nombre_completo: d.nombre_completo,
        tipo_contratacion: d.tipo_contratacion,
        tarifa_hora_actual: d.tarifa_hora_actual,
        estado: d.estado,
        etapas,
      },
      "Trabajador guardado.",
      id ? "PUT" : "POST",
    );
  });
}
function laborForm() {
  const stages = db.orders
    .filter((o) => o.state === 1)
    .flatMap((o) =>
      o.etapas
        .filter((e) => e.estado === "En producción")
        .map((e) => [e.detalle_etapa_id, o.numero_orden + " · " + e.nombre]),
    );
  if (!requireOptions(stages, "Inicia una etapa antes de registrar horas."))
    return;
  showModal(
    "Registrar mano de obra",
    formHTML(
      selectField("Orden y etapa", "detalle_etapa_id", stages, "", true) +
        selectField("Trabajador", "trabajador_id", activeWorkers(), "", true) +
        field("Fecha", "fecha", today(), "date", "required") +
        field(
          "Horas trabajadas",
          "horas_trabajadas",
          "",
          "number",
          'min="0.0001" max="24" step="0.0001" required',
        ),
    ),
  );
  bindForm((d) =>
    command("/api/labor", d, "Horas y tarifa aplicada registradas."),
  );
}
function catalogsView() {
  const specs = {
    units: ["Unidades", "unidad_id"],
    lines: ["Líneas de calzado", "linea_id"],
    sizes: ["Tallas", "talla_id"],
    colors: ["Colores", "color_id"],
    models: ["Modelos", "modelo_id"],
    stages: ["Etapas", "etapa_id"],
    locations: ["Ubicaciones", "ubicacion_id"],
  };
  return (
    heading(
      "Catálogos de fabricación",
      "Datos comunes para productos, materiales y operaciones.",
    ) +
    `<div class="guide-grid">${Object.entries(specs)
      .map(
        ([type, [label]]) =>
          `<section class="guide-card"><h2>${label}</h2><p>${db.refs[type].map((r) => esc(r.nombre || r.codigo || r.sistema + " " + r.valor)).join(" · ") || "Sin registros"}</p><button class="btn" data-action="new-catalog" data-id="${type}">Añadir ${label.toLowerCase()}</button></section>`,
      )
      .join("")}</div>`
  );
}
function catalogForm(type) {
  let content = "";
  if (["units", "lines", "colors", "models", "stages"].includes(type))
    content += field(
      "Nombre",
      "nombre",
      "",
      "text",
      'required maxlength="80"',
      true,
    );
  if (["models", "locations"].includes(type))
    content += field("Código", "codigo", "", "text", 'required maxlength="40"');
  if (type === "units")
    content += field(
      "Símbolo",
      "simbolo",
      "",
      "text",
      'required maxlength="16"',
    );
  if (type === "sizes")
    content +=
      field(
        "Sistema de tallaje",
        "sistema",
        "EU",
        "text",
        'required maxlength="20"',
      ) + field("Valor", "valor", "", "text", 'required maxlength="16"');
  if (type === "colors")
    content += field(
      "Color de representación",
      "tono",
      "#365b83",
      "color",
      "required",
    );
  if (type === "models")
    content += selectField(
      "Línea",
      "linea_id",
      refOptions("lines", "linea_id"),
    );
  if (["models", "stages", "locations"].includes(type))
    content += textarea("Descripción", "descripcion", "", type === "locations");
  showModal("Añadir al catálogo", formHTML(content));
  bindForm((d) => command("/api/catalogs/" + type, d, "Catálogo actualizado."));
}
function budgetsView() {
  return (
    heading(
      "Presupuestos de fabricación",
      "Versiones por orden, partidas y contingencia.",
      button("Nuevo presupuesto", "new-budget"),
    ) +
    tableView(
      [
        "Orden",
        "Versión",
        "Nombre",
        "Vigencia",
        "Estado",
        "Subtotal",
        "Contingencia",
        "Total",
        "Acciones",
      ],
      db.budgets.map((b) => [
        esc(db.orders.find((o) => o.orden_id === b.orden_id)?.numero_orden),
        String(b.version),
        esc(b.nombre),
        date(b.vigente_desde) + " → " + date(b.vigente_hasta),
        esc(b.estado_aprobacion),
        num(b.subtotal),
        num(b.porcentaje_contingencia) + "%",
        num(b.total),
        `<button class="btn small" data-action="budget-detail" data-id="${b.presupuesto_id}">Ver partidas</button>`,
      ]),
    ) +
    `<section class="section-gap"><h2>Costos directos registrados por orden</h2><p>Consumos valorizados y horas registradas; no incluye costos indirectos no registrados.</p>${tableView(
      ["Orden", "Materiales", "Mano de obra", "Costo directo"],
      db.costs.map((c) => [
        esc(db.orders.find((o) => o.orden_id === c.orden_id)?.numero_orden),
        num(c.materiales),
        num(c.mano_obra),
        c.incompleto
          ? "Parcial · faltan costos históricos"
          : num(c.materiales + c.mano_obra),
      ]),
    )}</section>`
  );
}
let budgetRowCount = 0;
function budgetRow() {
  const i = budgetRowCount++;
  return `<fieldset class="recipe-row" data-budget-row="${i}"><legend>Partida ${i + 1}</legend><div class="form-grid">${field("Concepto", "concept_" + i, "", "text", 'required maxlength="160"', true)}${selectField("Tipo de costo", "type_" + i, ["Material", "Mano de obra", "Indirecto"])}${selectField("Unidad", "unit_" + i, refOptions("units", "unidad_id"))}${field("Cantidad", "amount_" + i, 1, "number", 'min="0.0001" step="0.0001" required')}${field("Costo unitario estimado", "price_" + i, 0, "number", 'min="0" step="0.0001" required')}</div><button type="button" class="text-link" data-action="remove-budget">Quitar partida</button></fieldset>`;
}
function budgetForm() {
  if (!requireOptions(db.orders, "Crea primero una orden.")) return;
  budgetRowCount = 0;
  showModal(
    "Nuevo presupuesto / versión",
    formHTML(
      selectField(
        "Orden",
        "orden_id",
        db.orders.map((o) => [o.orden_id, o.numero_orden]),
        "",
        true,
      ) +
        field(
          "Nombre",
          "nombre",
          "",
          "text",
          'required maxlength="120"',
          true,
        ) +
        field(
          "Fecha de emisión",
          "fecha_emision",
          today(),
          "date",
          "required",
        ) +
        field("Vigente desde", "vigente_desde", today(), "date", "required") +
        field(
          "Vigente hasta",
          "vigente_hasta",
          shiftDate(30),
          "date",
          "required",
        ) +
        field(
          "Contingencia (%)",
          "porcentaje_contingencia",
          0,
          "number",
          'min="0" max="100" step="0.0001" required',
        ) +
        selectField("Aprobación", "estado_aprobacion", [
          "Borrador",
          "Aprobado",
          "Rechazado",
        ]) +
        `<div class="field full"><div id="budget-rows">${budgetRow()}</div><button type="button" class="btn" data-action="add-budget">Añadir partida</button></div>`,
    ),
  );
  bindForm((d) => {
    const detalles = [...document.querySelectorAll("[data-budget-row]")].map(
      (r) => {
        const i = r.dataset.budgetRow;
        return {
          concepto: d["concept_" + i],
          tipo_costo: d["type_" + i],
          unidad_id: Number(d["unit_" + i]),
          cantidad: Number(d["amount_" + i]),
          costo_unitario_estimado: Number(d["price_" + i]),
        };
      },
    );
    return command(
      "/api/budgets",
      {
        orden_id: Number(d.orden_id),
        nombre: d.nombre,
        fecha_emision: d.fecha_emision,
        vigente_desde: d.vigente_desde,
        vigente_hasta: d.vigente_hasta,
        porcentaje_contingencia: Number(d.porcentaje_contingencia),
        estado_aprobacion: d.estado_aprobacion,
        detalles,
      },
      "Presupuesto guardado en una nueva versión.",
    );
  });
}
function budgetDetail(id) {
  const b = db.budgets.find((b) => b.presupuesto_id === Number(id));
  showModal(
    "Presupuesto " + b.nombre,
    tableView(
      ["Partida", "Tipo", "Cantidad", "Costo unitario", "Importe"],
      b.detalles.map((d) => [
        esc(d.concepto),
        esc(d.tipo_costo),
        num(d.cantidad),
        num(d.costo_unitario_estimado),
        num(d.cantidad * d.costo_unitario_estimado),
      ]),
    ) + `<p>Total con contingencia: <strong>Bs ${num(b.total)}</strong></p>`,
  );
}
function download(filename, content, type) {
  const blob = new Blob([content], { type }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(filename, headers, rows) {
  const safe = (v) => {
    let s = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  download(
    filename + "-" + today() + ".csv",
    "\uFEFF" +
      [headers, ...rows].map((r) => r.map(safe).join(";")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
  toast("Archivo CSV exportado");
}
function exportOrders(rows) {
  csv(
    "ordenes-manaco",
    [
      "Orden",
      "Producto",
      "Talla",
      "Pares",
      "Estado",
      "Prioridad",
      "Inicio",
      "Entrega",
      "Responsable",
      "Fecha de cierre",
      "Evidencia",
    ],
    rows.map((o) => [
      o.numero_orden,
      product(o.product)?.name,
      o.size,
      o.quantity,
      states[o.state],
      o.priority,
      o.start,
      o.due,
      o.owner,
      o.closed,
      o.evidence,
    ]),
  );
}
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action,
    id = el.dataset.id;
  const handlers = {
    "new-order": orderForm,
    "new-product": () => productForm(),
    "edit-product": () => productForm(id),
    "new-material": () => materialForm(),
    "edit-material": () => materialForm(id),
    stock: () => stockForm(id),
    detail: () => detail(id),
    advance: () => advance(id),
    "start-stage": () =>
      command("/api/order-stages/" + id + "/start", {}, "Etapa iniciada."),
    "finish-stage": () => finishStageForm(id),
    "stage-incident": () => incidentForm(null, id),
    "new-incident": () => incidentForm(),
    "edit-incident": () => incidentForm(id),
    close: closeModal,
    pilot: () => pilotForm(id),
    "new-user": () => userForm(),
    "edit-user": () => userForm(id),
    "new-catalog": () => catalogForm(id),
    "new-worker": () => workerForm(),
    "edit-worker": () => workerForm(id),
    "new-labor": laborForm,
    "new-reservation": reserveForm,
    "release-reservation": () =>
      command("/api/reservations/" + id + "/release", {}, "Reserva liberada."),
    "new-budget": budgetForm,
    "budget-detail": () => budgetDetail(id),
    "ficha-detail": () => fichaDetail(id),
    "add-recipe": () =>
      $("#recipe-rows").insertAdjacentHTML("beforeend", recipeRow()),
    "remove-recipe": () => el.closest("[data-recipe-row]").remove(),
    "add-budget": () =>
      $("#budget-rows").insertAdjacentHTML("beforeend", budgetRow()),
    "remove-budget": () => el.closest("[data-budget-row]").remove(),
    "confirm-legacy": confirmLegacy,
    backup: async () =>
      download(
        "respaldo-manaco-mysql-" + today() + ".json",
        JSON.stringify(await api("/api/backup"), null, 2),
        "application/json",
      ),
    "legacy-export": () => {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) {
        toast("Este navegador no contiene registros anteriores.");
        return;
      }
      download(
        "respaldo-manaco-anterior-" + today() + ".json",
        raw,
        "application/json",
      );
    },
    "export-orders": () =>
      exportOrders(route === "orders" ? filteredOrders() : db.orders),
    "export-materials": () =>
      csv(
        "materiales-manaco",
        ["Código", "Material", "Existencia", "Reservado", "Mínimo", "Unidad"],
        db.materials.map((m) => [
          m.codigo,
          m.name,
          m.stock,
          m.reserved,
          m.min,
          m.unit,
        ]),
      ),
    "export-report": () => exportOrders(reportOrders()),
    print: () => window.print(),
    "filter-report": () => {
      const from = $("#report-from").value,
        to = $("#report-to").value;
      if (from && to && from > to) {
        toast("La fecha inicial no puede ser posterior a la final.");
        return;
      }
      reportFrom = from;
      reportTo = to;
      render();
    },
    "clear-report": () => {
      reportFrom = "";
      reportTo = "";
      render();
    },
  };
  el.disabled = true;
  try {
    await handlers[action]?.();
  } catch (error) {
    toast(error.message);
  } finally {
    el.disabled = false;
  }
});
function updateResults() {
  const html = {
    orders: () => orderTable(filteredOrders()),
    products: productCards,
    materials: materialsTable,
    incidents: incidentsTable,
  }[route];
  if (html) {
    $("#results").innerHTML = html();
    applyPermissions($("#results"));
  }
}
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value;
    updateResults();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "legacy-file")
    previewLegacyFile(e.target.files[0]).catch((error) => toast(error.message));
  if (e.target.id === "status-filter") {
    statusFilter = e.target.value;
    updateResults();
  }
});
$("#close-modal").onclick = closeModal;
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
function setNavigation(open, restoreFocus = true) {
  const sidebar = $("#sidebar");
  sidebar.classList.toggle("is-open", open);
  $("#menu-toggle").setAttribute("aria-expanded", String(open));
  $("#menu-backdrop").hidden = !open;
  $(".shell").inert = open;
  document.body.classList.toggle("menu-open", open);
  if (open) {
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.setAttribute("aria-label", "Navegación principal");
    $("#close-navigation").focus();
  } else {
    sidebar.setAttribute("role", "complementary");
    sidebar.removeAttribute("aria-modal");
    sidebar.removeAttribute("aria-label");
    if (restoreFocus) $("#menu-toggle").focus();
  }
}
$("#menu-toggle").onclick = () => setNavigation(true);
$("#close-navigation").onclick = () => setNavigation(false);
$("#menu-backdrop").onclick = () => setNavigation(false);
document.addEventListener("keydown", (e) => {
  if (!$("#sidebar").classList.contains("is-open")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    setNavigation(false);
  }
  if (e.key === "Tab") {
    const controls = [
      ...$("#sidebar").querySelectorAll("a[href],button:not([disabled])"),
    ];
    const first = controls[0],
      last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("resize", () => {
  if (
    window.matchMedia("(min-width:651px)").matches &&
    $("#sidebar").classList.contains("is-open")
  ) {
    setNavigation(false, false);
    (
      $('#navigation a[aria-current="page"]') || $('#sidebar a[href="#guide"]')
    ).focus();
  }
});
window.addEventListener("hashchange", () => {
  if (!currentUser) return;
  query = "";
  statusFilter = "";
  const fromNavigation = $("#sidebar").classList.contains("is-open");
  if (fromNavigation) setNavigation(false, false);
  if ($("#modal").open) closeModal();
  render();
  $("#main").focus();
  window.scrollTo(0, 0);
});
$("#notification").innerHTML = icon("bell");
$("#notification").onclick = () => {
  showModal(
    "Centro de atención",
    `<div class="alert-list">${alertsHTML()}</div><div class="form-footer"><button class="btn primary" data-action="close">Entendido</button></div>`,
  );
};
$("#plant-icon").innerHTML = icon("factory");
$(".skip").onclick = (e) => {
  e.preventDefault();
  $("#main").focus();
};
$("#refresh-data").onclick = () =>
  loadState()
    .then(() => toast("Datos actualizados."))
    .catch((e) => toast(e.message));
$("#logout").onclick = async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    showLogin();
  } catch (e) {
    toast(e.message);
  }
};
bootstrap();

function fichaDetail(id) {
  const p = product(id);
  showModal(
    "Fichas de " + p.sku,
    db.fichas
      .filter((f) => f.producto_id === p.producto_id)
      .map(
        (f) =>
          `<section class="section-gap"><h3>Versión ${f.version} · ${esc(f.estado)}</h3>${tableView(
            [
              "Secuencia",
              "Etapa",
              "Minutos / par",
              "Mano de obra / par",
              "Materiales y merma",
            ],
            f.etapas.map((e) => [
              String(e.secuencia),
              esc(e.nombre),
              num(e.minutos_estimados_por_par),
              num(e.costo_mano_obra_estimado_por_par),
              e.materiales
                .map(
                  (m) =>
                    esc(
                      db.materials.find((x) => x.material_id === m.material_id)
                        ?.name,
                    ) +
                    " · " +
                    num(m.cantidad_neta_por_par) +
                    " + " +
                    num(m.porcentaje_merma) +
                    "%",
                )
                .join("<br>") || "Sin materiales",
            ]),
          )}</section>`,
      )
      .join(""),
  );
}
let legacyPending = null;
async function previewLegacyFile(file) {
  if (!file) return;
  legacyPending = null;
  if (file.size > 10 * 1024 * 1024) throw Error("El respaldo supera 10 MB.");
  const data = JSON.parse(await file.text());
  const p = await api("/api/legacy/preview", {
    method: "POST",
    body: JSON.stringify(data),
  });
  legacyPending = { data, expectedHash: p.hash };
  const labels = {
    materials: "Materiales",
    models: "Modelos",
    variants: "Variantes por talla y color",
    orders: "Órdenes",
    incidents: "Incidencias",
    movements: "Movimientos registrados",
    workers: "Responsables",
  };
  showModal(
    "Revisar migración de datos",
    tableView(
      ["Información", "Registros"],
      Object.entries(p.counts).map(([k, v]) => [labels[k], num(v)]),
    ) +
      `<div class="note"><ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>${p.conflicts.length ? `<div class="note danger">No se modificará la base: hay conflictos con ${p.conflicts.map(esc).join(", ")}.</div>` : p.alreadyImported ? '<div class="note">Este archivo ya fue migrado. No se duplicarán registros.</div>' : "<p>Se añadirán los registros. Los datos existentes se conservarán.</p>"}<div class="form-footer"><button class="btn" data-action="close">Cerrar</button>${p.canImport && !p.alreadyImported ? '<button class="btn primary" data-action="confirm-legacy">Confirmar migración</button>' : ""}</div>`,
  );
}
function confirmLegacy() {
  if (!legacyPending) throw Error("Selecciona primero un respaldo.");
  return command(
    "/api/legacy/import",
    legacyPending,
    "Datos migrados y guardados en MySQL.",
  );
}

function canAct(action) {
  if (currentUser?.role === "Administrador") return true;
  const read = [
    "detail",
    "ficha-detail",
    "budget-detail",
    "close",
    "export-orders",
    "export-materials",
    "export-report",
    "print",
    "filter-report",
    "clear-report",
  ];
  if (read.includes(action)) return true;
  return (
    currentUser?.role === "Operador" &&
    [
      "new-order",
      "advance",
      "start-stage",
      "finish-stage",
      "stage-incident",
      "new-incident",
      "edit-incident",
      "stock",
      "new-reservation",
      "release-reservation",
      "new-labor",
    ].includes(action)
  );
}
function applyPermissions(root) {
  for (const el of root.querySelectorAll("[data-action]"))
    if (!canAct(el.dataset.action)) el.hidden = true;
}
function usersView() {
  if (currentUser?.role !== "Administrador")
    return heading(
      "Usuarios y permisos",
      "Solo disponible para administradores.",
    );
  return (
    heading(
      "Usuarios y permisos",
      "Administrador: configuración y cuentas. Operador: producción e inventario. Consulta: solo lectura.",
      button("Nuevo usuario", "new-user"),
    ) +
    tableView(
      ["Usuario", "Perfil", "Estado", "Acciones"],
      (db.users || []).map((u) => [
        esc(u.nombre),
        esc(u.rol),
        u.activo ? "Activo" : "Inactivo",
        `<button class="btn small" data-action="edit-user" data-id="${u.usuario_id}">Editar</button>`,
      ]),
    )
  );
}
function userForm(id) {
  const u = (db.users || []).find((u) => u.usuario_id === Number(id));
  showModal(
    u ? "Editar usuario" : "Nuevo usuario",
    formHTML(
      field(
        "Usuario",
        "nombre",
        u?.nombre || "",
        "text",
        'required maxlength="80"',
        true,
      ) +
        selectField(
          "Perfil",
          "rol",
          ["Administrador", "Operador", "Consulta"],
          u?.rol || "Operador",
        ) +
        selectField(
          "Estado",
          "activo",
          [
            [1, "Activo"],
            [0, "Inactivo"],
          ],
          u ? u.activo : 1,
        ) +
        field(
          u ? "Nueva contraseña (vacía para conservar)" : "Contraseña",
          "password",
          "",
          "password",
          `${u ? "" : "required"} minlength="12" maxlength="200" autocomplete="new-password"`,
          true,
        ),
    ),
  );
  bindForm((d) =>
    command(
      "/api/users" + (id ? "/" + id : ""),
      {
        nombre: d.nombre,
        rol: d.rol,
        activo: d.activo === "1",
        ...(d.password ? { password: d.password } : {}),
      },
      "Usuario guardado; los cambios de acceso revocan las sesiones anteriores.",
      id ? "PUT" : "POST",
    ),
  );
}
