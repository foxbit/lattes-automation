/**
 * DIAGNÓSTICO: HTML do form complementar — lupas de inst e curso
 * Uso: npx tsx src/diag-complementar3.ts
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
  console.log('🔬 DIAG: HTML form complementar v3\n');
  
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
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // Pegar HTML bruto ao redor de f_inst e f_curso
  const instSection = await formFrame.evaluate(() => {
    const input = document.querySelector('input[name="f_inst"]');
    if (!input) return 'SEM f_inst';
    let el = input as HTMLElement;
    for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement;
    return el.outerHTML.substring(0, 2000);
  });
  
  const cursoSection = await formFrame.evaluate(() => {
    const input = document.querySelector('input[name="f_curso"]');
    if (!input) return 'SEM f_curso';
    let el = input as HTMLElement;
    for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement;
    return el.outerHTML.substring(0, 2000);
  });
  
  const funcs = await formFrame.evaluate(() => {
    const names = ['sele_inst', 'curso', 'sele_curso', 'pesq_curso', 'cons_curso', 'selecionaCurso'];
    const out: string[] = [];
    for (const n of names) {
      if (typeof (window as any)[n] === 'function') out.push(n);
    }
    return out;
  });
  
  const allLupas = await formFrame.evaluate(() => {
    const out: string[] = [];
    const els = document.querySelectorAll('a, img, input[type="button"]');
    for (const el of els) {
      const html = el.outerHTML;
      if (html.includes('lupa') || html.includes('Lupa') || html.includes('sele_') || html.includes('pesq') || html.includes('curso')) {
        out.push(`${el.tagName}: ${html.substring(0, 250)}`);
      }
    }
    return out.slice(0, 20);
  });
  
  console.log('\n📄 Seção f_inst:\n' + instSection);
  console.log('\n📄 Seção f_curso:\n' + cursoSection);
  console.log('\n📋 Funções globais: ' + JSON.stringify(funcs));
  console.log('\n🔍 Elementos lupa/curso:');
  for (const l of allLupas) console.log(`   ${l}`);
  
  await nav.takeSnapshot('diag_compl3');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
