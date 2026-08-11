import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function exploreModule(
  menuCategory: string,
  submenuItem: string,
  framePattern: string,
  label: string
) {
  console.log(`\n═══ Explorando: ${label} ═══`);
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  await nav.openMenu(menuCategory);
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem(submenuItem);
  await page.waitForTimeout(5000);

  let frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes(framePattern)) { frame = f; break; }
  }
  if (!frame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') { frame = f; break; }
    }
  }

  if (!frame) { console.log('❌ Frame não encontrado'); await session.close(); return; }
  console.log('Frame URL:', frame.url());

  // Check for include button
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`Records: ${listState.data.records.length}`);
    console.log(`Has Incluir: ${listState.data.hasNewButton}`);
    for (const r of listState.data.records) {
      console.log(`  • ${r.text.substring(0, 120)}`);
    }
  }

  // Click include and explore form
  const result = await nav.clickNewRecord(frame);
  console.log('clickNewRecord:', result.success);

  if (result.success) {
    await page.waitForTimeout(3000);

    // Find form frame
    let formFrame: Frame | null = null;
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== frame.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
        if (url.includes('.form') || url.includes('.inclui')) {
          formFrame = f;
          break;
        }
      }
    }
    if (!formFrame) {
      const nonMain = page.frames().filter(f =>
        f !== page.mainFrame() && f !== frame && f.url() !== 'about:blank'
      );
      if (nonMain.length > 0) formFrame = nonMain[nonMain.length - 1];
    }

    if (formFrame) {
      console.log('Form Frame:', formFrame.url());
      const fields = await nav.readFormFields(formFrame);
      console.log(`Fields: ${fields.length}`);
      for (const f of fields) {
        const val = f.value ? ` = "${f.value.substring(0, 60)}"` : ' (vazio)';
        const opts = f.options ? ` [${f.options.length} opts: ${f.options.slice(0, 3).join(', ')}]` : '';
        console.log(`  • ${f.label || f.name || f.id} (${f.type})${val}${opts}`);
      }

      // Check for global functions
      const fns = await formFrame.evaluate(() => {
        return Object.keys(window).filter(k =>
          typeof (window as any)[k] === 'function' &&
          !k.startsWith('_') && !k.startsWith('webkit')
        ).slice(0, 30);
      });
      console.log('Global functions:', fns.join(', '));
    }
  }

  await nav.takeSnapshot(`explore_${label}`);
  await session.close();
}

async function main() {
  const module = process.argv[2] || 'all';

  if (module === 'idiomas' || module === 'all') {
    await exploreModule('Dados gerais', 'Idiomas', 'pkg_idioma', 'idiomas');
  }
  if (module === 'formacao' || module === 'all') {
    await exploreModule('Formação', 'Formação acadêmica/titulação', 'pkg_formacao', 'formacao');
  }
  if (module === 'complementar' || module === 'all') {
    await exploreModule('Formação', 'Formação complementar', 'pkg_formacao_compl', 'complementar');
  }
}

main().catch(console.error);
