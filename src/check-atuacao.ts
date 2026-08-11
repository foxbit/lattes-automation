/**
 * Verifica a lista REAL de atuação profissional (recarrega módulo)
 * Uso: npx tsx src/check-atuacao.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  console.log('🔍 Verificando atuação profissional (recarga)\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Fechar qualquer modal residual
  await nav.closeModal();
  await page.waitForTimeout(2000);
  
  // Reabrir menu de atuação
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(6000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`\n📋 Registros: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`   • ${r.text.substring(0, 150)}`);
    }
  } else {
    console.log('   Status:', listState.error || 'sem dados');
  }
  
  await nav.takeSnapshot('check_atuacao');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
