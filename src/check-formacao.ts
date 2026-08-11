/**
 * Verifica estado atual da formação acadêmica + tenta buscar UFPR no CNPq
 * Uso: npx tsx src/check-formacao.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  console.log('🔍 Verificando formação acadêmica\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);
  
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`Registros: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`• ${r.text.substring(0, 200)}`);
    }
  }
  
  // Buscar UFPR com diferentes termos
  const terms = ['UFPR', 'Federal do Paran', 'Universidade Federal'];
  for (const term of terms) {
    console.log(`\n🔎 Buscando "${term}"...`);
    const result = await nav.searchInstitution(term);
    console.log(`   Resultado: ${result.success ? '✅' : '❌ ' + result.error}`);
    if (result.success && result.data) {
      for (const r of (result.data.results || []).slice(0, 10)) {
        console.log(`   • ${r.text}`);
      }
    }
  }
  
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
