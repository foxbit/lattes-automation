/**
 * Popula o resumo do Lattes — v2 com detecção robusta do botão Salvar
 * Uso: npx tsx src/populate-resumo-v2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const RESUMO = `Designer de Produto com formação em Comunicação Social e especialização em Gestão de Produtos Digitais. Atua em UX/UI Design, Design de Serviços, Inovação Digital e Design Centrado no Usuário, com experiência em projetos de plataformas SaaS, aplicativos mobile e portais institucionais para os setores de varejo, saúde, educação e serviços jurídicos.`;

async function findSaveButton(frame: Frame): Promise<any | null> {
  // Try multiple strategies to find the save button
  const strategies = [
    // By value attribute
    async () => await frame.$('input[value="Salvar"]'),
    // By onclick containing "salvar" or "submit"
    async () => await frame.$('input[onclick*="salvar"], input[onclick*="Salvar"]'),
    // By type submit
    async () => await frame.$('input[type="submit"]'),
    // By button text
    async () => await frame.$('button:has-text("Salvar")'),
    // Search all clickable elements
    async () => {
      const elements = await frame.$$('input[type="button"], input[type="submit"], button, a.btn, a[role="button"]');
      for (const el of elements) {
        const val = await el.getAttribute('value').catch(() => '');
        const text = await el.textContent().catch(() => '');
        const title = await el.getAttribute('title').catch(() => '');
        if ((val || '').toLowerCase().includes('salvar') || 
            (text || '').toLowerCase().includes('salvar') ||
            (title || '').toLowerCase().includes('salvar')) {
          return el;
        }
      }
      return null;
    },
  ];

  for (const strategy of strategies) {
    const btn = await strategy();
    if (btn) return btn;
  }
  return null;
}

async function main() {
  console.log('📝 Populando resumo do Lattes (v2)');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate
  console.log('📂 Navegando...');
  await nav.openMenu('Dados gerais');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Texto inicial do Currículo Lattes');
  await page.waitForTimeout(6000);
  
  // Find frame
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const u = f.url();
    if (u.includes('pkg_resume.form') || u.includes('prc_')) {
      formFrame = f;
      break;
    }
  }
  if (!formFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') {
        formFrame = f;
        break;
      }
    }
  }
  
  if (!formFrame) {
    console.error('❌ Frame não encontrado');
    await session.close();
    return;
  }
  
  console.log(`   Frame: ${formFrame.url()}`);
  
  // Read current content
  const textareas = await formFrame.$$('textarea');
  console.log(`   Textareas encontrados: ${textareas.length}`);
  
  if (textareas.length === 0) {
    console.error('❌ Nenhum textarea encontrado');
    await session.close();
    return;
  }
  
  // Read current value
  const currentVal = await textareas[0].inputValue();
  console.log(`   Valor atual (primeiros 80 chars): "${currentVal.substring(0, 80)}..."`);
  
  // Fill Portuguese textarea
  await textareas[0].fill('');
  await textareas[0].fill(RESUMO);
  console.log('✅ Texto PT preenchido');
  
  // Verify it was filled
  const newVal = await textareas[0].inputValue();
  console.log(`   Valor após preencher (primeiros 80 chars): "${newVal.substring(0, 80)}..."`);
  
  if (newVal.substring(0, 30) !== RESUMO.substring(0, 30)) {
    console.error('❌ Texto não foi preenchido corretamente');
    await session.close();
    return;
  }
  
  // Find and click save
  console.log('🔍 Procurando botão Salvar...');
  
  // List all interactive elements for debugging
  const allInputs = await formFrame.$$('input, button, a');
  console.log(`   Elementos interativos: ${allInputs.length}`);
  for (const el of allInputs) {
    const tag = await el.evaluate(e => e.tagName);
    const type = await el.getAttribute('type').catch(() => '');
    const val = await el.getAttribute('value').catch(() => '');
    const text = await el.textContent().catch(() => '');
    const onclick = await el.getAttribute('onclick').catch(() => '');
    if (val || text || onclick) {
      console.log(`   <${tag}> type="${type}" value="${val}" text="${(text||'').substring(0,40)}" onclick="${(onclick||'').substring(0,50)}"`);
    }
  }
  
  // The save button is an <a> with onclick="check();return false;"
  let saveBtn = await formFrame.$('a[onclick*="check()"]');
  if (!saveBtn) {
    const allLinks = await formFrame.$$('a');
    for (const link of allLinks) {
      const text = await link.textContent().catch(() => '');
      if (text && text.trim() === 'Salvar') {
        saveBtn = link;
        break;
      }
    }
  }
  if (saveBtn) {
    console.log('   ✅ Botão encontrado! Clicando...');
    await saveBtn.click();
    await page.waitForTimeout(5000);
    
    // Check for success/error messages
    const bodyText = await formFrame.textContent('body').catch(() => '');
    if (bodyText.includes('sucesso') || bodyText.includes('Salvo') || bodyText.includes('atualizado')) {
      console.log('✅ Resumo salvo com sucesso!');
    } else if (bodyText.includes('erro') || bodyText.includes('Erro')) {
      console.log('⚠️  Possível erro após salvar');
    } else {
      console.log('✅ Botão Salvar clicado (sem mensagem de erro detectada)');
    }
  } else {
    console.error('❌ Botão Salvar não encontrado em nenhum frame');
    
    // Try clicking in all frames
    console.log('   Tentando em todos os frames...');
    for (const f of page.frames()) {
      if (f === page.mainFrame()) continue;
      const btn = await findSaveButton(f);
      if (btn) {
        console.log(`   ✅ Botão encontrado no frame: ${f.url()}`);
        await btn.click();
        await page.waitForTimeout(5000);
        console.log('✅ Clicado!');
        break;
      }
    }
  }
  
  await nav.takeSnapshot('populate_resumo_v2');
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
