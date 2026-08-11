/**
 * DIAGNÓSTICO 3: o que aparece após buscar "SENAC" no modalCV3
 * Uso: npx tsx src/diag-lupa3.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function main() {
  console.log('🔬 DIAG 3: busca SENAC no modalCV3\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  await nav.clickNewRecord();
  
  let formFrame: Frame | null = null;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes('PKG_ATIV.inclui')) { formFrame = f; break; }
    }
    if (formFrame) break;
  }
  if (!formFrame) { console.log('❌ form não encontrado'); await session.close(); return; }
  
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
  if (!cv3Frame) { console.log('❌ CV3 não encontrado'); await session.close(); return; }
  
  console.log(`✅ CV3: ${cv3Frame.url()}`);
  
  // Preencher f_nome e submeter
  await cv3Frame.evaluate(() => {
    const inp = document.querySelector('input[name="f_nome"]') as HTMLInputElement;
    if (inp) {
      inp.value = 'SENAC';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('form[name="instituicaoForm"]');
    if (form) (form as HTMLFormElement).submit();
  });
  console.log('   Busca submetida');
  await page.waitForTimeout(6000);
  
  // Inspecionar resultados
  console.log('\n📋 Resultados após 6s:');
  const info = await cv3Frame.evaluate(() => {
    const area = document.querySelector('.areaSelecao');
    const areaHTML = area ? area.outerHTML.substring(0, 2000) : 'SEM .areaSelecao';
    
    // All links
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.textContent?.trim().substring(0, 100) || '',
      className: a.className,
      onclick: a.getAttribute('onclick'),
    }));
    
    // Check for tables
    const tables = Array.from(document.querySelectorAll('table')).map(t => t.outerHTML.substring(0, 800));
    
    // Body text after "Foram encontrados"
    const body = document.body.textContent || '';
    const match = body.match(/Foram encontrados[^<]{0,50}/);
    
    return { areaHTML, links: links.slice(0, 15), tables: tables.slice(0, 5), foundMsg: match ? match[0] : null };
  });
  
  console.log('Foram encontrados:', info.foundMsg);
  console.log('\nLinks:', JSON.stringify(info.links, null, 2));
  console.log('\n.areaSelecao HTML:', info.areaHTML.substring(0, 1000));
  
  await nav.takeSnapshot('diag3_senac');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
