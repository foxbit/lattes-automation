/**
 * DIAGNÓSTICO: fluxo "Cadastrar nova instituição" no modalCV3
 * 
 * Objetivo: entender o form de cadastro de instituição (nome + CNPJ)
 * que aparece quando a busca não encontra a instituição.
 * 
 * Uso: npx tsx src/diag-nova-inst.ts
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
  console.log('🔬 DIAG: Cadastrar nova instituição\n');
  
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
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // Buscar instituição inexistente para forçar "Cadastrar nova instituição"
  console.log('\n🔍 Buscando "Pipa Produções" (inexistente no CNPq)...');
  await nav.fillLupa('f_inst', 'Pipa Produções', formFrame);
  await page.waitForTimeout(2000);
  
  // Verificar estado — o modalCV3 pode estar aberto com "Cadastrar nova instituição"
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  
  if (!cv3Frame) {
    console.log('⚠️  ModalCV3 não está aberto — o fillLupa pode ter clicado em algo');
    await nav.takeSnapshot('diag_inst1');
    await session.close();
    return;
  }
  
  console.log(`✅ CV3: ${cv3Frame.url()}`);
  
  // Inspecionar o modal — procurar "Cadastrar nova instituição"
  const info = await cv3Frame.evaluate(() => {
    const body = document.body.textContent || '';
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 80),
      onclick: a.getAttribute('onclick'),
      href: a.getAttribute('href'),
    })).filter(x => x.text || x.onclick || x.href);
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
      tag: i.tagName, name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type || 'select',
      value: ((i as HTMLInputElement).value || '').substring(0, 40),
    }));
    const forms = Array.from(document.querySelectorAll('form')).map(f => ({
      name: f.name,
      action: f.action,
      method: f.method,
    }));
    return { body: body.substring(0, 400), links, inputs, forms };
  });
  
  console.log('\n📋 Conteúdo do CV3:');
  console.log(`   ${info.body.substring(0, 300)}`);
  console.log('\n   Links:', JSON.stringify(info.links, null, 2));
  console.log('\n   Inputs:', JSON.stringify(info.inputs, null, 2));
  console.log('\n   Forms:', JSON.stringify(info.forms, null, 2));
  
  // Clicar "Cadastrar nova instituição"
  const cadastrarLink = await cv3Frame.$('a:has-text("Cadastrar nova"), a:has-text("cadastrar nova")');
  if (cadastrarLink) {
    console.log('\n🆕 Clicando "Cadastrar nova instituição"...');
    await cadastrarLink.click();
    await page.waitForTimeout(3000);
    
    // Inspecionar o novo form
    const novoForm = await cv3Frame.evaluate(() => {
      const body = document.body.textContent || '';
      const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
        tag: i.tagName, name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type || 'select',
        value: ((i as HTMLInputElement).value || '').substring(0, 40),
        placeholder: (i as HTMLInputElement).placeholder,
      }));
      const links = Array.from(document.querySelectorAll('a, input[type="button"], button')).map(a => ({
        text: (a.textContent || '').trim().substring(0, 60),
        onclick: a.getAttribute('onclick'),
        value: (a as HTMLInputElement).value || '',
      })).filter(x => x.text || x.onclick || x.value);
      return { body: body.substring(0, 400), inputs, links };
    });
    
    console.log('\n📋 Form de cadastro:');
    console.log(`   ${novoForm.body.substring(0, 300)}`);
    console.log('\n   Inputs:', JSON.stringify(novoForm.inputs, null, 2));
    console.log('\n   Links/Botões:', JSON.stringify(novoForm.links, null, 2));
  }
  
  await nav.takeSnapshot('diag_nova_inst');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
