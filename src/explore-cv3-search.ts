import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao')) { listFrame = f; break; }
  }

  // Open Especialização form
  await listFrame!.evaluate(() => {
    const fn = (window as any).selecionarNivel;
    const source = fn.toString();
    const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
    const baseUrl = urlMatch ? urlMatch[1] : '';
    let match: RegExpExecArray | null;
    const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
    while ((match = regex.exec(source)) !== null) {
      if (match[1] === 'Especialização') {
        (self.parent as any).modalCV2.setarUrl(baseUrl + match[2], true);
        return;
      }
    }
  });
  await page.waitForTimeout(5000);

  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url !== listFrame!.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
      formFrame = f; break;
    }
  }
  if (!formFrame) { console.log('NO FORM FRAME'); await session.close(); return; }

  // Open institution search
  await formFrame.evaluate(() => { (window as any).sele_inst(1); });
  await page.waitForTimeout(3000);

  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) { console.log('NO CV3'); await session.close(); return; }
  console.log('CV3 URL:', cv3Frame.url());

  // Get the full HTML of the CV3 form
  const cv3Html = await cv3Frame.evaluate(() => {
    return document.body.innerHTML.substring(0, 3000);
  });
  console.log('CV3 HTML:\n', cv3Html);

  // Try searching with "Faculdade" to test
  const searchInput = await cv3Frame.$('input[name="f_nome"]');
  if (searchInput) {
    await searchInput.fill('FIAP');

    // Try submitting via form submit
    console.log('\n--- Trying form submit ---');
    await cv3Frame.evaluate(() => {
      const form = document.querySelector('form');
      if (form) {
        console.log('Submitting form:', form.action);
        form.submit();
      }
    });
    await page.waitForTimeout(3000);

    // Check for results
    const html2 = await cv3Frame.evaluate(() => {
      return document.body.innerHTML.substring(0, 3000);
    });
    console.log('\nAfter submit HTML:\n', html2);

    // Check for clickable results
    const clickables = await cv3Frame.evaluate(() => {
      const result: any[] = [];
      // tr[onclick]
      document.querySelectorAll('tr[onclick]').forEach(tr => {
        result.push({ type: 'tr', text: tr.textContent?.trim().substring(0, 100), onclick: tr.getAttribute('onclick')?.substring(0, 200) });
      });
      // a[onclick]
      document.querySelectorAll('a[onclick]').forEach(a => {
        result.push({ type: 'a', text: a.textContent?.trim().substring(0, 100), onclick: a.getAttribute('onclick')?.substring(0, 200) });
      });
      // td with onclick
      document.querySelectorAll('td[onclick]').forEach(td => {
        result.push({ type: 'td', text: td.textContent?.trim().substring(0, 100), onclick: td.getAttribute('onclick')?.substring(0, 200) });
      });
      return result;
    });
    console.log('\nClickable results:');
    for (const c of clickables) {
      console.log(`  [${c.type}] "${c.text}" → ${c.onclick}`);
    }
  }

  await session.close();
}

main().catch(console.error);
