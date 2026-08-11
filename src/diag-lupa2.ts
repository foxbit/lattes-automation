/**
 * DIAGNÓSTICO 2: seleção de resultado no modalCV3 + overlay
 * 
 * Objetivo: clicar no resultado da busca e verificar se a instituição
 * é aplicada ao campo. Entender o mecanismo de seleção e o overlay.
 * 
 * Uso: npx tsx src/diag-lupa2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function main() {
  console.log('🔬 DIAGNÓSTICO 2: seleção de instituição + overlay\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // 1. Navegar
  console.log('📂 Navegando para Atuação...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // 2. Abrir novo registro
  await nav.clickNewRecord();
  
  let formFrame: Frame | null = null;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes('PKG_ATIV.inclui')) { formFrame = f; break; }
    }
    if (formFrame) break;
  }
  
  if (!formFrame) {
    console.log('❌ Form frame não encontrado');
    await session.close();
    return;
  }
  console.log(`✅ Form frame: ${formFrame.url()}`);
  
  // 3. Clicar na lupa (via evaluate, mais confiável)
  console.log('\n🖱️ Abrindo lupa instituição...');
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
    if (el) el.click();
  });
  await page.waitForTimeout(4000);
  
  // 4. Encontrar modalCV3
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) {
    console.log('❌ CV3 não encontrado');
    await session.close();
    return;
  }
  console.log(`✅ CV3 frame: ${cv3Frame.url()}`);
  
  // 5. Buscar FIAP
  console.log('\n🔍 Buscando "FIAP"...');
  const searchInput = await cv3Frame.$('input[name="f_nome"]');
  if (!searchInput) {
    console.log('❌ Input f_nome não encontrado');
    await session.close();
    return;
  }
  await searchInput.fill('FIAP');
  await page.waitForTimeout(500);
  
  // Clicar no botão pesquisar (imagem da lupa)
  const searchClicked = await cv3Frame.evaluate(() => {
    // Find the search image/button
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src || '';
      const alt = img.alt || '';
      if (src.includes('pesquisar') || src.includes('lupa') || alt.toLowerCase().includes('pesquisar')) {
        (img as HTMLElement).click();
        return 'img: ' + src.substring(0, 80);
      }
    }
    // Fallback: submit form
    const form = document.querySelector('form[name="instituicaoForm"]');
    if (form) {
      (form as HTMLFormElement).submit();
      return 'form submit';
    }
    return 'none';
  });
  console.log('   Search:', searchClicked);
  await page.waitForTimeout(4000);
  
  // 6. Inspecionar resultados
  console.log('\n📋 Inspecionando resultados...');
  const results = await cv3Frame.evaluate(() => {
    // Find all links in areaSelecao
    const area = document.querySelector('.areaSelecao');
    const links = Array.from(area ? area.querySelectorAll('a') : document.querySelectorAll('a')).map(a => ({
      text: a.textContent?.trim().substring(0, 100) || null,
      onclick: a.getAttribute('onclick')?.substring(0, 200) || null,
      href: a.getAttribute('href'),
      title: a.getAttribute('title'),
      className: a.className,
    }));
    
    // Find any "selecionar" functions
    const bodyText = document.body.textContent || '';
    const funcMatches = bodyText.match(/function\s+(\w+)[^{]*\{/g) || [];
    
    // Check for result table
    const tables = Array.from(document.querySelectorAll('table')).map(t => ({
      id: t.id,
      className: t.className,
      rows: t.rows.length,
    }));
    
    return { links: links.slice(0, 10), funcMatches: funcMatches.slice(0, 15), tables };
  });
  
  console.log('Links:', JSON.stringify(results.links, null, 2));
  console.log('Funções:', JSON.stringify(results.funcMatches, null, 2));
  console.log('Tabelas:', JSON.stringify(results.tables, null, 2));
  
  // 7. Clicar no resultado FIAP
  console.log('\n🖱️ Clicando no resultado FIAP...');
  const clickResult = await cv3Frame.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const text = link.textContent?.trim() || '';
      if (text.includes('FIAP')) {
        const onclick = link.getAttribute('onclick');
        // Try click first
        (link as HTMLElement).click();
        return { clicked: true, text, onclick };
      }
    }
    return { clicked: false };
  });
  console.log('Click result:', JSON.stringify(clickResult, null, 2));
  await page.waitForTimeout(4000);
  
  // 8. Verificar se o campo f_inst foi preenchido no form frame
  console.log('\n🔍 Verificando campo f_inst após seleção...');
  const instAfter = await formFrame.evaluate(() => {
    const input = document.querySelector('input[name="f_inst"]') as HTMLInputElement | null;
    const codInst = document.querySelector('input[name="f_cod_inst"]') as HTMLInputElement | null;
    const codInst2 = document.querySelector('input[name="f_cod_inst2"]') as HTMLInputElement | null;
    return {
      f_inst: input?.value || null,
      f_cod_inst: codInst?.value || null,
      f_cod_inst2: codInst2?.value || null,
    };
  });
  console.log('Após seleção:', JSON.stringify(instAfter, null, 2));
  
  // 9. Verificar overlays e o estado do CV3
  console.log('\n🔍 Estado dos modais/overlays...');
  const cv3Visible = await cv3Frame.evaluate(() => {
    const body = document.body;
    const style = window.getComputedStyle(body);
    return {
      display: style.display,
      visibility: style.visibility,
      textLen: body.textContent?.length || 0,
    };
  });
  console.log('CV3 state:', JSON.stringify(cv3Visible, null, 2));
  
  const overlays = await page.evaluate(() => {
    const els = document.querySelectorAll('.overlayDiv');
    return Array.from(els).map(el => ({
      className: el.className,
      style: el.getAttribute('style'),
      visible: el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0,
    }));
  });
  console.log('Overlays page:', JSON.stringify(overlays, null, 2));
  
  await nav.takeSnapshot('diag_lupa2');
  await session.close();
  console.log('\n✅ Diagnóstico 2 concluído');
}

main().catch(console.error);
