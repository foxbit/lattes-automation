/**
 * DIAGNÓSTICO: overlay + lupa instituição no Lattes
 * 
 * Objetivo: entender o DOM do modalCV3 (busca de instituição),
 * o mecanismo de seleção de resultados e o overlayDiv.
 * 
 * Uso: npx tsx src/diag-lupa.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function main() {
  console.log('🔬 DIAGNÓSTICO: lupa instituição + overlay\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // 1. Navegar para atuação profissional
  console.log('📂 Navegando para Atuação...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // 2. Abrir novo registro
  console.log('🆕 Abrindo novo registro...');
  const clickResult = await nav.clickNewRecord();
  if (!clickResult.success) {
    console.log(`❌ ${clickResult.error}`);
    await session.close();
    return;
  }
  
  // 3. Encontrar frame do formulário
  let formFrame: Frame | null = null;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes('PKG_ATIV.inclui')) { formFrame = f; break; }
    }
    if (formFrame) break;
  }
  
  if (!formFrame) {
    console.log('❌ Frame do formulário não encontrado');
    await session.close();
    return;
  }
  
  console.log(`✅ Form frame: ${formFrame.url()}`);
  
  // 4. Inspecionar o campo f_inst (estrutura da lupa)
  console.log('\n🔍 Inspecionando campo f_inst...');
  const instInfo = await formFrame.evaluate(() => {
    const input = document.querySelector('input[name="f_inst"]') as HTMLInputElement | null;
    if (!input) return { found: false };
    
    // Find parent container and lupa link
    let container = input.parentElement;
    let lupaLink: HTMLElement | null = null;
    let lupaImg: HTMLElement | null = null;
    let onclick = '';
    
    if (container) {
      // Look for onclick elements nearby
      const all = container.querySelectorAll('*');
      for (const el of all) {
        const oc = el.getAttribute('onclick');
        if (oc) {
          onclick = oc;
          lupaLink = el as HTMLElement;
          break;
        }
      }
      // Also check siblings
      if (!onclick) {
        for (const sib of Array.from(container.parentElement?.children || [])) {
          const oc = sib.getAttribute('onclick');
          if (oc) {
            onclick = oc;
            lupaLink = sib as HTMLElement;
            break;
          }
        }
      }
    }
    
    return {
      found: true,
      id: input.id,
      name: input.name,
      disabled: input.disabled,
      readonly: input.readOnly,
      className: input.className,
      value: input.value,
      onclick: onclick,
      lupaTag: lupaLink?.tagName || null,
      lupaText: lupaLink?.textContent?.trim() || null,
      parentHTML: container?.outerHTML.substring(0, 500) || null,
    };
  });
  
  console.log('Campo f_inst:', JSON.stringify(instInfo, null, 2));
  
  // 5. Clicar na lupa
  console.log('\n🖱️ Clicando na lupa...');
  
  // Try multiple ways to trigger the lupa
  const lupaTriggered = await formFrame.evaluate(() => {
    // Method 1: find element with onclick sele_inst
    const all = document.querySelectorAll('[onclick*="sele_inst"]');
    if (all.length > 0) {
      const el = all[0] as HTMLElement;
      el.click();
      return 'sele_inst click';
    }
    // Method 2: call the function directly
    if (typeof (window as any).sele_inst === 'function') {
      (window as any).sele_inst(1);
      return 'window.sele_inst(1)';
    }
    // Method 3: find input-lupa class
    const input = document.querySelector('input[name="f_inst"]') as HTMLInputElement | null;
    if (input) {
      // Try dispatching click on the magnifier image sibling
      const siblings = input.parentElement?.querySelectorAll('img, a') || [];
      for (const sib of siblings) {
        const src = (sib as HTMLImageElement).src || '';
        const oc = sib.getAttribute('onclick');
        if (src.includes('lupa') || src.includes('pesq') || oc) {
          (sib as HTMLElement).click();
          return 'sibling click: ' + (src || oc);
        }
      }
    }
    return 'none found';
  });
  
  console.log('Trigger lupa:', lupaTriggered);
  await page.waitForTimeout(4000);
  
  // 6. Encontrar modalCV3
  console.log('\n🔍 Procurando modalCV3...');
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    const u = f.url();
    console.log(`  frame: ${u}`);
    if (u.includes('prc_inst')) { cv3Frame = f; }
  }
  
  if (!cv3Frame) {
    console.log('❌ modalCV3 não encontrado');
  } else {
    console.log(`✅ CV3 frame: ${cv3Frame.url()}`);
    
    // 7. Inspecionar DOM do modalCV3
    console.log('\n🔍 Inspecionando DOM do modalCV3...');
    const cv3Info = await cv3Frame.evaluate(() => {
      const body = document.body;
      
      // Collect all inputs
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        name: i.name,
        type: i.type,
        value: i.value,
        id: i.id,
        className: i.className,
      }));
      
      // Collect all links with onclick
      const links = Array.from(document.querySelectorAll('a[onclick], input[onclick], img[onclick]')).map(a => ({
        tag: a.tagName,
        text: a.textContent?.trim().substring(0, 80) || null,
        onclick: a.getAttribute('onclick')?.substring(0, 120) || null,
        src: (a as HTMLImageElement).src?.substring(0, 100) || null,
      }));
      
      // Check for function definitions
      const hasSelecionar = typeof (window as any).selecionar !== 'undefined';
      const hasSelectInst = typeof (window as any).select_inst !== 'undefined';
      const hasSeleInst = typeof (window as any).sele_inst !== 'undefined';
      
      // Body text (truncated)
      const bodyText = body.textContent?.substring(0, 500) || '';
      
      // Forms
      const forms = Array.from(document.querySelectorAll('form')).map(f => ({
        name: f.name,
        id: f.id,
        action: f.action,
        method: f.method,
      }));
      
      return {
        inputs,
        links: links.slice(0, 20),
        hasSelecionar,
        hasSelectInst,
        hasSeleInst,
        forms,
        bodyText,
      };
    });
    
    console.log(JSON.stringify(cv3Info, null, 2));
    
    // 8. Testar busca
    console.log('\n🔍 Testando busca de instituição...');
    const searchInput = await cv3Frame.$('input[name="f_nome"], input[type="text"], input[name*="busca"]');
    if (searchInput) {
      const name = await searchInput.getAttribute('name');
      console.log(`  Input de busca: name="${name}"`);
      await searchInput.fill('FIAP');
      await page.waitForTimeout(500);
      
      // Try to find and click the search button
      const clicked = await cv3Frame.evaluate(() => {
        // Look for the search button
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.src || '';
          if (src.includes('pesquisar') || src.includes('lupa') || src.includes('busca') || img.alt?.toLowerCase().includes('pesquisar')) {
            (img as HTMLElement).click();
            return 'img click: ' + src.substring(0, 80);
          }
        }
        // Try form submit
        const form = document.querySelector('form');
        if (form) {
          form.submit();
          return 'form submit';
        }
        // Try button
        const btn = document.querySelector('input[type="submit"], button[type="submit"], input[value*="Pesquisar"]');
        if (btn) {
          (btn as HTMLElement).click();
          return 'button click: ' + (btn as HTMLInputElement).value;
        }
        return 'none';
      });
      console.log('  Search triggered:', clicked);
      await page.waitForTimeout(4000);
      
      // Read results
      const results = await cv3Frame.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const links = Array.from(document.querySelectorAll('a[onclick*="select"], a[onclick*="selecionar"], a[href*="select"]')).map(a => ({
          text: a.textContent?.trim().substring(0, 100) || null,
          onclick: a.getAttribute('onclick')?.substring(0, 150) || null,
        }));
        return { bodyText: bodyText.substring(0, 800), resultLinks: links.slice(0, 10) };
      });
      console.log('  Resultados:', JSON.stringify(results, null, 2));
    } else {
      console.log('  ❌ Input de busca não encontrado');
    }
  }
  
  // 9. Verificar overlays
  console.log('\n🔍 Verificando overlays...');
  const overlays = await page.evaluate(() => {
    const els = document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, [class*="overlay"]');
    return Array.from(els).map(el => ({
      tag: el.tagName,
      className: el.className,
      style: el.getAttribute('style'),
    }));
  });
  console.log('Overlays na página:', JSON.stringify(overlays, null, 2));
  
  const frameOverlays = formFrame ? await formFrame.evaluate(() => {
    const els = document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, [class*="overlay"]');
    return Array.from(els).map(el => ({
      tag: el.tagName,
      className: el.className,
      style: el.getAttribute('style'),
    }));
  }) : [];
  console.log('Overlays no form frame:', JSON.stringify(frameOverlays, null, 2));
  
  await nav.takeSnapshot('diag_lupa');
  await session.close();
  console.log('\n✅ Diagnóstico concluído');
}

main().catch(console.error);
