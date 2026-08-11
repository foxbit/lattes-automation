import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação complementar');
  await page.waitForTimeout(5000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao_compl')) { listFrame = f; break; }
  }
  if (!listFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') { listFrame = f; break; }
    }
  }
  if (!listFrame) { console.log('NO FRAME'); await session.close(); return; }

  // Click include
  const result = await nav.clickNewRecord(listFrame);
  console.log('clickNewRecord:', result.success);

  if (!result.success) { await session.close(); return; }

  // Find form frame
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url !== listFrame.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
      if (url.includes('FORMACAO_COMPL') || url.includes('.form')) {
        formFrame = f;
        break;
      }
    }
  }
  if (!formFrame) {
    const nonMain = page.frames().filter(f =>
      f !== page.mainFrame() && f !== listFrame && f.url() !== 'about:blank'
    );
    if (nonMain.length > 0) formFrame = nonMain[nonMain.length - 1];
  }

  if (!formFrame) { console.log('NO FORM FRAME'); await session.close(); return; }
  console.log('Form Frame:', formFrame.url());

  // Read first page fields
  console.log('\n=== Página 1 ===');
  const fields1 = await nav.readFormFields(formFrame);
  for (const f of fields1) {
    const val = f.value ? ` = "${f.value.substring(0, 60)}"` : ' (vazio)';
    const opts = f.options ? ` [${f.options.length} opts: ${f.options.slice(0, 5).join(', ')}]` : '';
    console.log(`  • ${f.label || f.name || f.id} (${f.type})${val}${opts}`);
  }

  // Fill some test data to enable Avançar
  // Set nivel
  await formFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_nivel"]') as HTMLSelectElement;
    if (sel) { sel.value = 'F'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  console.log('Set nivel to F');

  // Set institution
  const inst = await nav.fillLupa('f_inst', 'Teste', formFrame);
  console.log('fillLupa inst:', inst.success);

  // Set curso
  const curso = await nav.fillLupa('f_curso', 'Teste', formFrame);
  console.log('fillLupa curso:', curso.success);

  // Set status
  await nav.selectRadio('F_STATUS', 'S', formFrame);
  console.log('Set status to S');

  await page.waitForTimeout(1000);

  // Now click Avançar
  console.log('\nClicando Avançar...');
  const avancarResult = await formFrame.evaluate(() => {
    const btns = document.querySelectorAll('a, button, input[type="button"]');
    for (const btn of btns) {
      const text = btn.textContent?.trim() || (btn as HTMLInputElement).value || '';
      if (text.includes('Avançar')) {
        const onclick = btn.getAttribute('onclick');
        if (onclick) {
          try { eval(onclick); } catch { (btn as HTMLElement).click(); }
        } else {
          (btn as HTMLElement).click();
        }
        return { clicked: true, text, onclick: onclick?.substring(0, 100) };
      }
    }
    return { clicked: false };
  });
  console.log('Avançar result:', JSON.stringify(avancarResult));

  await page.waitForTimeout(3000);

  // Read second page fields
  console.log('\n=== Página 2 ===');
  const fields2 = await nav.readFormFields(formFrame);
  for (const f of fields2) {
    const val = f.value ? ` = "${f.value.substring(0, 60)}"` : ' (vazio)';
    const opts = f.options ? ` [${f.options.length} opts: ${f.options.slice(0, 5).join(', ')}]` : '';
    console.log(`  • ${f.label || f.name || f.id} (${f.type})${val}${opts}`);
  }

  // Also check for sidebar sections
  const sections = await nav.listSidebarSections(formFrame);
  console.log('\nSidebar sections:', sections);

  // Check for Salvar button
  const hasSave = await formFrame.evaluate(() => {
    const btns = document.querySelectorAll('a, button');
    for (const btn of btns) {
      if (btn.textContent?.trim() === 'Salvar') return true;
    }
    return false;
  });
  console.log('Has Salvar:', hasSave);

  await nav.takeSnapshot('explore_complementar_p2');
  await session.close();
}

main().catch(console.error);
