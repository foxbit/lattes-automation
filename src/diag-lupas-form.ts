/**
 * DIAGNÓSTICO: elementos lupa (instituição e curso) no form de aperfeiçoamento
 * Uso: npx tsx src/diag-lupas-form.ts
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
        && (url.includes('.form') || url.includes('pkg_formacao'))) {
        return f;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG: elementos lupa no form\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  const levelData = await listFrame.evaluate(() => {
    const fn = (window as any).selecionarNivel;
    if (!fn) return null;
    const source = fn.toString();
    const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
    const baseUrl = urlMatch ? urlMatch[1] : '';
    const result: Array<{ name: string; url: string }> = [];
    const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      result.push({ name: match[1], url: baseUrl + match[2] });
    }
    return result;
  });
  
  const aperf = levelData?.find(l => l.name.toLowerCase().includes('aperfeiçoamento'));
  if (!aperf) { console.log('❌ Aperfeiçoamento'); await session.close(); return; }
  
  await listFrame.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, aperf.url);
  await page.waitForTimeout(5000);
  
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // Listar TODOS os elementos com onclick ou class lupa ou img
  const lupas = await formFrame.evaluate(() => {
    const result: Array<{ tag: string; onclick: string | null; className: string; text: string; src: string; alt: string }> = [];
    const els = document.querySelectorAll('a, img, input[type="button"], input[type="image"], button');
    for (const el of els) {
      const oc = el.getAttribute('onclick');
      const cls = el.className || '';
      const src = (el as HTMLImageElement).src || '';
      const alt = (el as HTMLImageElement).alt || '';
      if (oc || cls.includes('lupa') || src.includes('lupa') || alt.includes('lupa')) {
        result.push({
          tag: el.tagName,
          onclick: oc,
          className: cls,
          text: (el.textContent || '').trim().substring(0, 40),
          src: src.substring(0, 80),
          alt,
        });
      }
    }
    return result;
  });
  
  console.log('\n📋 Elementos com lupa/onclick:');
  for (const l of lupas) {
    console.log(`   <${l.tag}> class="${l.className}" onclick="${l.onclick}" src="${l.src}" alt="${l.alt}" text="${l.text}"`);
  }
  
  // Listar funções globais disponíveis relacionadas a curso
  const funcs = await formFrame.evaluate(() => {
    const names = ['curso', 'sele_curso', 'consultarCurso', 'cadastrarCurso', 'sele_inst', 'recuperaCurso'];
    const result: Record<string, boolean> = {};
    for (const n of names) {
      result[n] = typeof (window as any)[n] === 'function';
    }
    return result;
  });
  console.log('\n📋 Funções globais:');
  console.log(`   ${JSON.stringify(funcs)}`);
  
  await nav.takeSnapshot('diag_lupas_form');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
