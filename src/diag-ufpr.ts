/**
 * Busca instituições UFPR no modalCV3 do form de formação (Aperfeiçoamento)
 * Uso: npx tsx src/diag-ufpr.ts
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

async function searchTerm(page: Page, formFrame: Frame, term: string) {
  console.log(`\n🔎 Buscando "${term}"...`);
  
  // Abrir lupa de instituição
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
    if (el) el.click();
  });
  await page.waitForTimeout(4000);
  
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) {
    console.log('   ❌ CV3 não encontrado');
    return;
  }
  
  // Preencher e submeter
  await cv3Frame.evaluate((t: string) => {
    const inp = document.querySelector('input[name="f_nome"]') as HTMLInputElement;
    if (inp) {
      inp.value = t;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('form[name="instituicaoForm"]');
    if (form) (form as HTMLFormElement).submit();
  }, term);
  await page.waitForTimeout(6000);
  
  // Coletar resultados
  const info = await cv3Frame.evaluate(() => {
    const found = document.body.textContent?.match(/Foram encontrados[^<]{0,50}/);
    const links = Array.from(document.querySelectorAll('a'))
      .map(a => a.textContent?.trim().substring(0, 100) || '')
      .filter(t => t.length > 3);
    return { found: found ? found[0] : null, links };
  });
  
  console.log(`   ${info.found || 'sem mensagem'}`);
  for (const l of info.links.slice(0, 15)) {
    console.log(`   • ${l}`);
  }
  
  // Fechar CV3 (clicar Fechar se houver)
  const fechar = await cv3Frame.$('input[value="Fechar"], a:has-text("Fechar"), a[onclick*="fechar"]');
  if (fechar) await fechar.click().catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, .win-overlay').forEach(el => el.remove());
  }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function main() {
  console.log('🔍 Diagnóstico busca UFPR\n');
  
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
  if (!listFrame) { console.log('❌ lista não encontrada'); await session.close(); return; }
  
  // Abrir Aperfeiçoamento
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
  if (!aperf) { console.log('❌ Aperfeiçoamento não encontrado'); await session.close(); return; }
  
  await listFrame.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, aperf.url);
  await page.waitForTimeout(5000);
  
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form não encontrado'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // Testar termos
  for (const term of ['Universidade Federal do Paraná', 'Universidade Federal do Parana', 'UFPR']) {
    await searchTerm(page, formFrame, term);
  }
  
  await nav.takeSnapshot('diag_ufpr');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
