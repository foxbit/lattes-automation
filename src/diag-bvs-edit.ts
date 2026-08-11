/**
 * DIAGNÓSTICO: frames após clicar no TR da BVS (cargos_vinculos)
 * Uso: npx tsx src/diag-bvs-edit.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  console.log('🔬 DIAG: frames após click TR BVS\n');
  
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
  
  // Clicar na linha BVS
  const clicked = await listFrame.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      const text = (row.textContent || '').toLowerCase();
      if (text.includes('builders venture')) {
        const oc = row.getAttribute('onclick') || '';
        const match = oc.match(/setarUrl\(['"]([^'"]+)['"]/);
        if (match) {
          (window as any).modalCV2?.setarUrl?.(match[1], true);
          return { clicked: true, url: match[1] };
        }
      }
    }
    return { clicked: false };
  });
  console.log('Click:', JSON.stringify(clicked));
  
  // Listar TODOS os frames após 2s, 5s, 8s
  for (const delay of [2000, 5000, 8000]) {
    await page.waitForTimeout(delay);
    const frames = page.frames().map(f => f.url());
    console.log(`\n⏱️ Após ${delay / 1000}s — ${page.frames().length} frames:`);
    frames.forEach((u, i) => console.log(`   [${i}] ${u}`));
  }
  
  await nav.takeSnapshot('diag_bvs_edit');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
