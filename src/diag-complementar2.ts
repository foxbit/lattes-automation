/**
 * DIAGNÓSTICO: HTML do form complementar — lupas de inst e curso
 * Uso: npx tsx src/diag-complementar2.ts
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
        && (url.includes('.form') || url.includes('FORMACAO_COMPL') || url.includes('formacao_compl'))) {
        return f;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG: HTML form complementar\n');
  
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
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  await nav.clickNewRecord(listFrame);
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  
  // Dump: section ao redor dos campos f_inst e f_curso
  const html = await formFrame.evaluate(() => {
    const getSection = (name: string) => {
      const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
      if (!input) return null;
      // Subir 4 níveis para pegar a seção
      let el: HTMLElement | null = input;
      for (let i = 0; i < 4 && el; i++) el = el.parentElement;
      return el ? el.outerHTML : null;
    };
    return {
      inst: getSection('f_inst')?.substring(0, 1500) || null,
      curso: getSection('f_curso')?.substring(0, 1500) || null,
      // Todos os elementos com onclick lupa
      lupas: Array.from(document.querySelectorAll('a[onclick*="sele"], a[onclick*="lupa"], a.lupa, img[onclick]')).map(el => ({
        tag: el.tagName,
        outerHTML: el.outerHTML.substring(0, 300),
      })),
      // Funções globais
      funcs: ['sele_inst', 'curso', 'sele_curso', 'pesq_curso'].filter(f => typeof (window as any)[f] === 'function'),
    };
  });
  
  console.log('\n📄 Seção f_inst:');
  console.log(html.inst);
  console.log('\n📄 Seção f_curso:');
  console.log(html.curso);
  console.log('\n🔍 Lupas:');
  for (const l of html.lupas) console.log(`   ${l.tag}: ${l.outerHTML}`);
  console.log('\n📋 Funções globais:', html.funcs);
  
  await nav.takeSnapshot('diag_compl2');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
