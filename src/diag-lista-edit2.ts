/**
 * DIAGNÓSTICO 2: onclick de TODOS os elementos da lista (incluindo td/tr/a internos)
 * Uso: npx tsx src/diag-lista-edit2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  console.log('🔬 DIAG2: elementos com onclick na lista\n');
  
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
  
  // Mapear TODOS os elementos com onclick, com contexto (tag, classe, texto próximo)
  const items = await listFrame.evaluate(() => {
    const result: Array<{ tag: string; cls: string; onclick: string; text: string; parentText: string }> = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const oc = el.getAttribute && el.getAttribute('onclick');
      if (oc) {
        result.push({
          tag: el.tagName,
          cls: (el.getAttribute && el.getAttribute('class')) || '',
          onclick: oc.substring(0, 150),
          text: ((el.textContent || '').trim().substring(0, 60)),
          parentText: ((el.parentElement?.textContent || '').trim().substring(0, 80)),
        });
      }
    }
    return result;
  });
  
  console.log(`\n🎯 Elementos com onclick (${items.length}):`);
  for (const it of items) console.log(`   <${it.tag} class="${it.cls}"> onclick="${it.onclick}"\n     text="${it.text}"\n     parent="${it.parentText}"`);
  
  // Também mapear a tabela: estrutura tr/td e se há links nas células
  const table = await listFrame.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    return rows.slice(0, 8).map((r, i) => {
      const tds = Array.from(r.querySelectorAll('td')).map(td => {
        const anchors = Array.from(td.querySelectorAll('a')).map(a => ({
          onclick: a.getAttribute('onclick') || '',
          href: a.getAttribute('href') || '',
          text: (a.textContent || '').trim().substring(0, 50),
        }));
        return { html: td.innerHTML.substring(0, 200), anchors };
      });
      return { row: i, text: (r.textContent || '').trim().substring(0, 100), tds };
    });
  });
  
  console.log(`\n📊 Tabela (primeiras 8 linhas):`);
  for (const row of table) {
    console.log(`   Row ${row.row}: "${row.text}"`);
    for (const td of row.tds) {
      if (td.anchors.length) {
        console.log(`     🔗 anchors: ${JSON.stringify(td.anchors)}`);
      }
    }
  }
  
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
