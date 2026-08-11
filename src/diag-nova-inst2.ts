/**
 * DIAGNÓSTICO 2: abrir o form "Cadastrar nova instituição" e mapear campos
 * Uso: npx tsx src/diag-nova-inst2.ts
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
  console.log('🔬 DIAG 2: form cadastrar nova instituição\n');
  
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
  
  // Abrir lupa diretamente (sem fillLupa — só abrir o modal)
  console.log('🔍 Abrindo lupa de instituição...');
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
    if (el) el.click();
  });
  await page.waitForTimeout(4000);
  
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) { console.log('❌ CV3 não abriu'); await session.close(); return; }
  console.log(`✅ CV3: ${cv3Frame.url()}`);
  
  // Buscar "Pipa Produções" para gerar "não encontrado" + botão cadastrar
  await cv3Frame.evaluate(() => {
    const inp = document.querySelector('input[name="f_nome"]') as HTMLInputElement;
    if (inp) {
      inp.value = 'Pipa Produções';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('form[name="instituicaoForm"]');
    if (form) (form as HTMLFormElement).submit();
  });
  await page.waitForTimeout(5000);
  
  // Clicar "Cadastrar nova instituição"
  console.log('\n🆕 Clicando "Cadastrar nova instituição"...');
  const cadastrarLink = await cv3Frame.$('a:has-text("Cadastrar nova instituição"), a:has-text("cadastrar nova")');
  if (!cadastrarLink) {
    console.log('❌ Link não encontrado');
    const links = await cv3Frame.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map(a => (a.textContent || '').trim()).filter(t => t.length > 3)
    );
    console.log('   Links disponíveis:', JSON.stringify(links));
    await nav.takeSnapshot('diag_inst2_nolink');
    await session.close();
    return;
  }
  await cadastrarLink.click();
  await page.waitForTimeout(4000);
  
  // Mapear o form de cadastro
  const info = await cv3Frame.evaluate(() => {
    const body = document.body.textContent || '';
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
      tag: i.tagName, name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type || 'select',
      value: ((i as HTMLInputElement).value || '').substring(0, 40),
      id: i.id,
    }));
    const links = Array.from(document.querySelectorAll('a, input[type="button"], button')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 60),
      onclick: a.getAttribute('onclick'),
      value: (a as HTMLInputElement).value || '',
    })).filter(x => x.text || x.onclick || x.value);
    const forms = Array.from(document.querySelectorAll('form')).map(f => ({
      name: f.name, action: f.action, method: f.method,
    }));
    return { body: body.substring(0, 500), inputs, links, forms };
  });
  
  console.log('\n📋 Form de cadastro:');
  console.log(`   ${info.body.substring(0, 400)}`);
  console.log('\n   Inputs:', JSON.stringify(info.inputs, null, 2));
  console.log('\n   Links/Botões:', JSON.stringify(info.links, null, 2));
  console.log('\n   Forms:', JSON.stringify(info.forms, null, 2));
  
  // Testar preenchimento com CNPJ da Pipa
  console.log('\n🧪 Preenchendo Pipa Produções com CNPJ...');
  const fillResult = await cv3Frame.evaluate(() => {
    const res: Record<string, string> = {};
    const inputs = document.querySelectorAll('input, select, textarea');
    for (const i of inputs) {
      const name = (i as HTMLInputElement).name || '';
      if (name) res[name] = 'existe';
    }
    return res;
  });
  console.log('   Campos com name:', JSON.stringify(fillResult));
  
  await nav.takeSnapshot('diag_nova_inst2');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
