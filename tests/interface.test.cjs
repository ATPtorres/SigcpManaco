// Browser regression checks against the real backend and isolated MySQL test database.
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const { chromium } = require("playwright");

const { createPool } = require("../server/db.cjs");
const { createApp } = require("../server/app.cjs");
const axe = require("axe-core");
const testName = process.env.DB_TEST_NAME || "sigcp_manaco_test";
if (
  !/^[a-zA-Z0-9_]+_test$/.test(testName) ||
  testName === (process.env.DB_NAME || "sigcp_manaco")
)
  throw Error("Se requiere una base _test independiente.");
const pool = createPool(testName);
const server = http.createServer(createApp(pool));

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const executablePath =
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.locator("#login-form").waitFor();
    await page.locator("[name=username]").fill(process.env.APP_USER || "admin");
    await page.locator("[name=password]").fill(process.env.APP_PASSWORD);
    await page.locator("#login-form button").click();
    await page.waitForFunction(
      () => !document.body.classList.contains("signed-out"),
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("sigcp-manaco-v1")),
      null,
    );
    const routes = [
      "dashboard",
      "orders",
      "tracking",
      "products",
      "materials",
      "incidents",
      "reports",
      "project",
      "inventory",
      "workers",
      "budgets",
      "catalogs",
      "settings",
      "guide",
    ];
    for (const width of [320, 360, 390, 650, 651, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
      for (const route of routes) {
        await page.goto(`${origin}/#${route}`);
        await page.waitForFunction(
          () => !document.body.classList.contains("signed-out"),
        );
        await page.locator("#main h1").waitFor();
        const documentWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );
        assert.ok(
          documentWidth <= width,
          `${route} at ${width}px overflows to ${documentWidth}px`,
        );
        if ([390, 1440].includes(width)) {
          await page.evaluate(axe.source);
          const audit = await page.evaluate(() => axe.run());
          assert.deepEqual(
            audit.violations.map((v) => ({
              id: v.id,
              targets: v.nodes.map((n) => n.target),
            })),
            [],
            `${route} at ${width}px`,
          );
        }
      }
    }
    console.log(
      "PASS 126 route/viewport combinations without page overflow; axe on 28 views",
    );

    await page.setViewportSize({ width: 390, height: 568 });
    await page.goto(origin);
    await page.waitForFunction(
      () => !document.body.classList.contains("signed-out"),
    );
    await page.locator("#menu-toggle").click();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "close-navigation",
    );
    assert.equal(await page.locator(".shell").evaluate((el) => el.inert), true);
    assert.equal(
      await page.locator("#sidebar").getAttribute("aria-modal"),
      "true",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("href")),
      "#guide",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "close-navigation",
    );
    await page.locator('#sidebar a[href="#guide"]').scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator("#sidebar").evaluate((el) => el.scrollTop > 0),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".shell").evaluate((el) => el.inert),
      false,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "menu-toggle",
    );
    await page.locator("#menu-toggle").click();
    await page.locator("#close-navigation").click();
    assert.equal(
      await page.locator("#menu-toggle").getAttribute("aria-expanded"),
      "false",
    );
    await page.locator("#menu-toggle").click();
    await page
      .locator("#menu-backdrop")
      .click({ position: { x: 380, y: 250 } });
    assert.equal(
      await page.locator("#menu-toggle").getAttribute("aria-expanded"),
      "false",
    );
    await page.locator("#menu-toggle").click();
    await page.locator('#navigation a[href="#products"]').click();
    await page.waitForFunction(() => document.title === "Productos · MANACO");
    assert.equal(await page.evaluate(() => document.activeElement.id), "main");
    assert.equal(
      await page.locator(".shell").evaluate((el) => el.inert),
      false,
    );
    await page.locator("#menu-toggle").click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => !document.querySelector(".shell").inert);
    assert.equal(
      await page.locator("#sidebar").getAttribute("role"),
      "complementary",
    );
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-current"),
      ),
      "page",
    );
    await page.setViewportSize({ width: 390, height: 568 });
    await page.goto(`${origin}/#guide`);
    await page.waitForFunction(
      () => !document.body.classList.contains("signed-out"),
    );
    await page.locator("#menu-toggle").click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => !document.querySelector(".shell").inert);
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("href")),
      "#guide",
    );
    console.log(
      "PASS navigation focus, keyboard cycle, Escape, close button, backdrop, scroll, routing and resize",
    );

    for (const [route, action] of [
      ["orders", "new-order"],
      ["products", "new-product"],
      ["materials", "new-material"],
      ["incidents", "new-incident"],
    ]) {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto(`${origin}/#${route}`);
      await page.waitForFunction(
        () => !document.body.classList.contains("signed-out"),
      );
      await page.locator(`[data-action="${action}"]`).click();
      await page.locator("dialog[open]").waitFor();
      assert.ok(
        await page
          .locator("dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        `${action} dialog overflows`,
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator("dialog").evaluate((el) => el.open),
        false,
      );
    }
    await page.setViewportSize({ width: 1024, height: 900 });
    const go = async (route) => {
      await page.goto(`${origin}/#${route}`);
      await page.waitForFunction(
        () => !document.body.classList.contains("signed-out"),
      );
      await page.locator("#main h1").waitFor();
    };
    const fill = async (name, value) =>
      page.locator(`#record-form [name="${name}"]`).fill(String(value));
    const choose = async (name, value) =>
      page.locator(`#record-form [name="${name}"]`).selectOption(String(value));
    const save = async () => {
      await page.locator("#record-form [type=submit]").click();
      await page.waitForFunction(
        () =>
          !document.querySelector("#modal").open ||
          document.querySelector("#form-error")?.textContent,
      );
      if (await page.locator("#modal").evaluate((el) => el.open))
        throw Error(await page.locator("#form-error").innerText());
    };
    const read = async () =>
      (await page.request.get(origin + "/api/state")).json();
    const stamp = Date.now();
    let state = await read();
    await go("workers");
    await page.locator('[data-action="new-worker"]').click();
    await fill("codigo", "UI-" + stamp);
    await fill("nombre_completo", "Operario UI " + stamp);
    await fill("tarifa_hora_actual", 35.5);
    await page
      .locator(`[name="skill_${state.refs.stages[0].etapa_id}"]`)
      .check();
    await save();
    state = await read();
    const worker = state.workers.find((w) => w.codigo === "UI-" + stamp);
    await go("materials");
    await page.locator('[data-action="new-material"]').click();
    await fill("codigo", "MAT-UI-" + stamp);
    await fill("nombre", "Material UI " + stamp);
    await fill("costo_referencia", 1.5);
    await fill("stock_inicial", 50);
    await fill("codigo_lote", "LOTE-UI");
    await save();
    state = await read();
    const material = state.materials.find(
      (m) => m.codigo === "MAT-UI-" + stamp,
    );
    await go("catalogs");
    await page.locator('[data-action="new-catalog"][data-id="models"]').click();
    await fill("codigo", "MOD-UI-" + stamp);
    await fill("nombre", "Modelo UI " + stamp);
    await save();
    state = await read();
    const model = state.refs.models.find((m) => m.codigo === "MOD-UI-" + stamp);
    await go("products");
    await page.locator('[data-action="new-product"]').click();
    await fill("sku", "SKU-UI-" + stamp);
    await choose("modelo_id", model.modelo_id);
    await choose("material_0", material.material_id);
    await fill("qty_0", 1);
    await fill("waste_0", 10);
    await fill("minutes_0", 2);
    await save();
    state = await read();
    const product = state.products.find((p) => p.sku === "SKU-UI-" + stamp);
    await go("orders");
    await page.locator('[data-action="new-order"]').click();
    await choose("producto_id", product.producto_id);
    await choose("trabajador_id", worker.trabajador_id);
    await fill("cantidad_planificada", 2);
    await save();
    state = await read();
    const order = state.orders.find(
      (o) => o.producto_id === product.producto_id,
    );
    const stage = order.etapas[0];
    await go("inventory");
    await page.locator('[data-action="new-reservation"]').click();
    await choose("detalle_etapa_id", stage.detalle_etapa_id);
    await choose(
      "existencia_id",
      state.lots.find((l) => l.material_id === material.material_id)
        .existencia_id,
    );
    await fill("cantidad_pendiente", 2.2);
    await save();
    await go("orders");
    await page
      .locator(`[data-action="detail"][data-id="${order.id}"]`)
      .first()
      .click();
    await page.locator('#modal [data-action="advance"]').click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    await go("workers");
    await page.locator('[data-action="new-labor"]').click();
    await choose("detalle_etapa_id", stage.detalle_etapa_id);
    await choose("trabajador_id", worker.trabajador_id);
    await fill("horas_trabajadas", 1);
    await save();
    await go("incidents");
    await page.locator('[data-action="new-incident"]').click();
    await choose("detalle_etapa_id", stage.detalle_etapa_id);
    await choose("responsable_id", worker.trabajador_id);
    await fill("descripcion", "Incidencia UI verificada");
    await save();
    state = await read();
    const incident = state.incidents.find(
      (i) => i.detalle_etapa_id === stage.detalle_etapa_id,
    );
    await page
      .locator(`[data-action="edit-incident"][data-id="${incident.id}"]`)
      .click();
    await choose("estado", "Resuelta");
    await fill("resolucion", "Ajuste realizado y comprobado");
    await save();
    await go("orders");
    await page
      .locator(`[data-action="detail"][data-id="${order.id}"]`)
      .first()
      .click();
    await page.locator('#modal [data-action="finish-stage"]').click();
    await save();
    await page
      .locator(`[data-action="detail"][data-id="${order.id}"]`)
      .first()
      .click();
    await page.locator('#modal [data-action="advance"]').click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    await page
      .locator(`[data-action="detail"][data-id="${order.id}"]`)
      .first()
      .click();
    await page.locator('#modal [data-action="advance"]').click();
    await fill(
      "evidencia",
      "Dos pares conformes verificados desde la interfaz",
    );
    await save();
    await page
      .locator(`[data-action="detail"][data-id="${order.id}"]`)
      .first()
      .click();
    await page.locator('#modal [data-action="advance"]').click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    await go("budgets");
    await page.locator('[data-action="new-budget"]').click();
    await choose("orden_id", order.orden_id);
    await fill("nombre", "Presupuesto UI");
    await fill("concept_0", "Material de prueba");
    await fill("price_0", 10);
    await fill("porcentaje_contingencia", 10);
    await save();
    state = await read();
    assert.equal(
      state.orders.find((o) => o.orden_id === order.orden_id).estado,
      "Despachado",
    );
    assert.equal(
      state.materials.find((m) => m.material_id === material.material_id).stock,
      47.8,
    );
    assert.equal(
      state.reservations.some(
        (r) => r.detalle_etapa_id === stage.detalle_etapa_id,
      ),
      false,
    );
    assert.equal(
      state.budgets.find((b) => b.orden_id === order.orden_id).total,
      11,
    );
    const secondContext = await browser.newContext();
    const login = await secondContext.request.post(origin + "/api/login", {
      data: {
        username: process.env.APP_USER || "admin",
        password: process.env.APP_PASSWORD,
      },
    });
    assert.equal(login.status(), 200);
    const shared = await (
      await secondContext.request.get(origin + "/api/state")
    ).json();
    assert.equal(
      shared.orders.find((o) => o.orden_id === order.orden_id).estado,
      "Despachado",
    );
    await secondContext.close();
    console.log(
      "PASS complete UI workflow: worker, material/lot, model, SKU/recipe, order, reservation, consumption, labor, incident resolution, quality, dispatch, budget and second session",
    );
    assert.deepEqual(errors, []);
    console.log("PASS four forms at 320px and no JavaScript errors");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
