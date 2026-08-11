/**
 * DIAGNÓSTICO: estrutura HTML da lista de atuação — links de edição
 * Uso: npx tsx src/diag-lista-edit.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  console.log('🔬 DIAG: estrutura lista atuação\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Atuação');
  await page.waitForTimeout(3000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(6000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  // Extrair links com onclick (sem avaliar)
  const links = await listFrame.evaluate(() => {
    const result: Array<{ text: string; onclick: string; href: string }> = [];
    const anchors = Array.from(document.querySelectorAll('a'));
    for (const a of anchors) {
      const oc = a.getAttribute('onclick') || '';
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').trim();
      if (oc || href) {
        result.push({ text: text.substring(0, 60), onclick: oc.substring(0, 120), href: href.substring(0, 120) });
      }
    }
    return result;
  });
  
  console.log(`\n🔗 Links na lista (${links.length}):`);
  for (const l of links) console.log(`   [${l.text}] onclick="${l.onclick}" href="${l.href}"`);
  
  await nav.takeSnapshot('diag_lista_edit');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
