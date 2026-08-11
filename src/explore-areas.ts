import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // Navigate to Atuação > Áreas de atuação
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Áreas de atuação');
  await page.waitForTimeout(5000);

  // Find frame
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url.includes('prc_area_atuacao')) { formFrame = f; break; }
  }
  if (!formFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') { formFrame = f; break; }
    }
  }

  if (!formFrame) { console.log('NO FRAME'); await session.close(); return; }
  console.log('Frame URL:', formFrame.url());

  // Get the HTML structure
  const html = await formFrame.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    const inputResults: any[] = [];
    inputs.forEach(inp => {
      inputResults.push({
        name: inp.name, id: inp.id, type: inp.type,
        className: inp.className, placeholder: inp.placeholder,
        disabled: inp.disabled, value: inp.value,
        outerHTML: inp.outerHTML.substring(0, 400),
      });
    });

    const links = document.querySelectorAll('a');
    const linkResults: any[] = [];
    links.forEach(a => {
      linkResults.push({
        text: a.textContent?.trim(),
        onclick: a.getAttribute('onclick')?.substring(0, 300),
        className: a.className,
      });
    });

    const selects = document.querySelectorAll('select');
    const selectResults: any[] = [];
    selects.forEach(s => {
      selectResults.push({
        name: s.name, id: s.id,
        optionCount: s.options.length,
        firstOpts: Array.from(s.options).slice(0, 5).map(o => o.value + '|' + o.text),
      });
    });

    // Global functions
    const globalFns = Object.keys(window).filter(k =>
      typeof (window as any)[k] === 'function' && 
      (k.includes('area') || k.includes('Area') || k.includes('inclui') || k.includes('nova') || k.includes('dominio') || k.includes('sele'))
    );

    return { inputs: inputResults, links: linkResults, selects: selectResults, globalFns };
  });

  console.log('\nINPUTS:', JSON.stringify(html.inputs, null, 2));
  console.log('\nLINKS:', JSON.stringify(html.links, null, 2));
  console.log('\nSELECTS:', JSON.stringify(html.selects, null, 2));
  console.log('\nGLOBAL FUNCTIONS:', html.globalFns);

  await session.close();
}
main().catch(console.error);
