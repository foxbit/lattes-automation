/**
 * DIAGNÓSTICO 3: opções dos selects pais/UF no form de nova instituição
 * Uso: npx tsx src/diag-nova-inst3.ts
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
  console.log('🔬 DIAG 3: selects pais/UF\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
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
  
  // Abrir lupa
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
    if (el) el.click();
  });
  await page.waitForTimeout(4000);
  
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) { console.log('❌ CV3'); await session.close(); return; }
  
  // Buscar inexistente
  await cv3Frame.evaluate(() => {
    const inp = document.querySelector('input[name="f_nome"]') as HTMLInputElement;
    if (inp) {
      inp.value = 'Pipa Produções XYZ';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('form[name="instituicaoForm"]');
    if (form) (form as HTMLFormElement).submit();
  });
  await page.waitForTimeout(5000);
  
  // Clicar cadastrar
  const cadastrarLink = await cv3Frame.$('a:has-text("Cadastrar nova instituição"), a:has-text("cadastrar nova")');
  if (cadastrarLink) {
    await cadastrarLink.click();
    await page.waitForTimeout(4000);
  }
  
  // Mapear selects
  const selects = await cv3Frame.evaluate(() => {
    const result: Record<string, string[]> = {};
    const sels = document.querySelectorAll('select');
    for (const s of sels) {
      const name = (s as HTMLSelectElement).name;
      result[name] = Array.from((s as HTMLSelectElement).options).map(o => `${o.value}=${o.textContent?.trim()}`);
    }
    return result;
  });
  
  console.log('\n📑 SELECTS:');
  for (const [name, opts] of Object.entries(selects)) {
    console.log(`   ${name}:`);
    for (const o of opts) console.log(`     ${o}`);
  }
  
  await nav.takeSnapshot('diag_nova_inst3');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
