const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const {chromium} = require('playwright');
const axe = require('axe-core');
const {createPool} = require('../server/db.cjs');
const {createApp} = require('../server/app.cjs');
const database = process.env.DB_TEST_NAME || 'sigcp_manaco_test';
if (!/^[a-zA-Z0-9_]+_test$/.test(database) || database === process.env.DB_NAME) throw Error('Se requiere una base de pruebas independiente.');
const pool = createPool(database), server = http.createServer(createApp(pool));
(async()=>{
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin = 'http://127.0.0.1:'+server.address().port;
    browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)});
    const context = await browser.newContext({reducedMotion:'reduce'});
    const login = await context.request.post(origin+'/api/login',{data:{username:process.env.APP_USER || 'admin',password:process.env.APP_PASSWORD}});
    assert.equal(login.status(),200);
    for(const [width,route] of [[1440,'dashboard'],[390,'products']]) {
      const page = await context.newPage({viewport:{width,height:900}});
      await page.setViewportSize({width,height:900});
      const external = []; page.on('request',request=>{if(!request.url().startsWith(origin)) external.push(request.url());});
      await page.addInitScript(()=>{
        window.layoutShiftScore = 0;
        new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.layoutShiftScore += entry.value;}).observe({type:'layout-shift',buffered:true});
      });
      await page.route('**/api/state?compact=1',async intercepted=>{await new Promise(resolve=>setTimeout(resolve,400));await intercepted.continue();});
      await page.goto(origin+'/#'+route);
      assert.ok(await page.locator('#startup').isVisible());
      await page.waitForFunction(()=>!document.body.classList.contains('booting'));
      await page.locator('#main h1').waitFor();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const measurement = await page.evaluate(()=>({cls:window.layoutShiftScore,readyMs:Math.round(performance.now())}));
      assert.ok(measurement.cls < 0.1, `${route}: CLS ${measurement.cls}`);
      assert.deepEqual(external,[],'No external font or analytics requests');
      console.log(`PASS cold startup ${route} ${width}px: CLS=${measurement.cls.toFixed(4)}, ready=${measurement.readyMs}ms (includes 400ms artificial API delay)`);
      await page.close();
    }
    const page = await context.newPage(); const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width:1440,height:900});
    for(const route of ['orders','products','workers','guide']) {
      await page.goto(origin+'/#'+route); await page.waitForFunction(()=>!document.body.classList.contains('booting'));
      await page.evaluate(()=>{document.body.style.zoom='2';});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), route+' overflows at 200% CSS zoom');
      if(route === 'orders') assert.ok(await page.locator('td').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14));
    }
    console.log('PASS dense pages at 200% CSS zoom and readable table text');
    await page.goto(origin);
    await page.waitForFunction(()=>!document.body.classList.contains('booting'));
    await page.locator('[data-action="support"]').click();
    await page.getByRole('heading',{name:'Soporte y uso de los datos',exact:true}).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-action="support-diagnostic"]').click();
    const diagnostic = JSON.parse(fs.readFileSync(await (await downloadPromise).path(),'utf8'));
    assert.deepEqual(Object.keys(diagnostic).sort(),['conexion','fecha','pantalla','pasos','seccion','version']);
    assert.ok(!JSON.stringify(diagnostic).includes(process.env.APP_PASSWORD));
    await page.evaluate(axe.source);
    assert.deepEqual((await page.evaluate(()=>axe.run(document.querySelector('dialog')))).violations.map(v=>v.id),[]);
    console.log('PASS support information and diagnostic without business records or credentials');
    const evaluationRequests = [];
    page.on('request',request=>evaluationRequests.push({url:request.url(),method:request.method()}));
    await page.goto(origin+'/evaluacion');
    await page.locator('#start-task').waitFor();
    assert.equal(await page.locator('#start-task').isDisabled(),true);
    assert.equal(await page.evaluate(()=>localStorage.getItem('manaco-observaciones-v1')),null);
    for(const width of [320,390,1440]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.evaluate(axe.source);
      assert.deepEqual((await page.evaluate(()=>axe.run())).violations.map(v=>v.id),[]);
    }
    await page.locator('#test-environment').check();
    assert.equal(await page.locator('#start-task').isDisabled(),true);
    await page.locator('#observation-consent').check();
    await page.locator('#participant').fill('P01');
    await page.locator('#start-task').click();
    await page.locator('#record-help').click();
    await page.locator('#observation-note').fill('<img src=x onerror=alert(1)> Dificultad para encontrar el siguiente paso.');
    await page.locator('#observation-form [type=submit]').click();
    let records = await page.evaluate(()=>JSON.parse(localStorage.getItem('manaco-observaciones-v1')));
    assert.equal(records.length,1); assert.equal(records[0].helps,1); assert.equal(records[0].outcome,'assisted');
    assert.equal(await page.locator('#evaluation-results img').count(),0);
    await page.locator('#start-task').click();
    await page.locator('#task-outcome').selectOption('incomplete');
    await page.locator('#observation-form [type=submit]').click();
    assert.ok((await page.locator('#evaluation-metrics').innerText()).includes('50%'));
    const exportPromise = page.waitForEvent('download'); await page.locator('#export-observations').click();
    const exported = JSON.parse(fs.readFileSync(await (await exportPromise).path(),'utf8'));
    assert.equal(exported.observations.length,2);
    await page.reload(); await page.locator('#start-task').waitFor();
    assert.equal(await page.locator('#evaluation-results .observation').count(),0);
    await page.locator('#test-environment').check(); await page.locator('#observation-consent').check();
    assert.ok((await page.locator('#evaluation-metrics').innerText()).includes('50%'));
    await page.locator('#start-task').click(); await page.locator('#observation-consent').uncheck();
    assert.equal(await page.locator('#active-task').isVisible(),false);
    records = await page.evaluate(()=>JSON.parse(localStorage.getItem('manaco-observaciones-v1'))); assert.equal(records.length,2);
    await page.locator('#clear-observations').click(); await page.locator('#confirm-clear').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('manaco-observaciones-v1')),null);
    assert.equal(evaluationRequests.some(r=>r.method !== 'GET'),false,'Observations must never be sent to the server');
    assert.deepEqual(errors,[]);
    console.log('PASS voluntary evaluation: consent, real task timer, help/outcome metrics, escaped notes, export, resume and deletion; no observation requests');
    await context.close();
  } finally { if(browser) await browser.close(); await new Promise(resolve=>server.close(resolve)); await pool.end(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
