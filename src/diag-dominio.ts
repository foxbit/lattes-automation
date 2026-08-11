/**
 * DIAGNÓSTICO: função dominio() e sele() — comportamento "Outro (especifique)"
 * Uso: npx tsx src/diag-dominio.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function findFormFrame(page: Page, listUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listUrl && url !== page.mainFrame().url() && url !== 'about:blank'
        && (url.includes('PKG_ATIV') || url.includes('pkg_ativ'))) {
        return f;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG: dominio() e sele()\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  page.on('dialog', async (dialog) => {
    console.log(`   💬 DIALOG CAPTURADO: ${dialog.type()} — "${dialog.message().substring(0, 100)}"`);
    try { await dialog.accept('Sócio'); } catch { /* ignore */ }
  });
  
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  await nav.clickNewRecord();
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  
  // Inspecionar a função dominio() no frame
  const dominioSrc = await formFrame.evaluate(() => {
    const fn = (window as any).dominio;
    return fn ? fn.toString().substring(0, 2000) : 'NÃO EXISTE';
  });
  console.log('\n📄 dominio() source:');
  console.log(dominioSrc);
  
  // Inspecionar a função sele() no frame
  const seleSrc = await formFrame.evaluate(() => {
    const fn = (window as any).sele;
    return fn ? fn.toString().substring(0, 3000) : 'NÃO EXISTE';
  });
  console.log('\n📄 sele() source:');
  console.log(seleSrc);
  
  await nav.takeSnapshot('diag_dominio');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
