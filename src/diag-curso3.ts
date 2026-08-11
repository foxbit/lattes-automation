/**
 * DIAGNÓSTICO 3: fluxo completo do curso (busca + cadastro novo)
 * Uso: npx tsx src/diag-curso3.ts
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
  console.log('🔬 DIAG 3: fluxo curso completo\n');
  
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
  
  // Selecionar UFPR
  console.log('🏫 UFPR...');
  await nav.fillLupa('f_inst', 'Universidade Federal do Paraná', formFrame);
  
  // Abrir modal curso
  console.log('\n🎓 Abrindo curso()...');
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('❌ Modal curso não abriu'); await session.close(); return; }
  console.log(`✅ Modal curso: ${cursoFrame.url()}`);
  
  // Inspecionar
  const info = await cursoFrame.evaluate(() => {
    const body = document.body.textContent || '';
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
      tag: i.tagName, name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type || 'select',
      value: ((i as HTMLInputElement).value || '').substring(0, 40),
    }));
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 80),
      onclick: a.getAttribute('onclick'),
    })).filter(x => x.text || x.onclick);
    const buttons = Array.from(document.querySelectorAll('input[type="button"], button')).map(b => ({
      value: (b as HTMLInputElement).value || (b.textContent || '').trim(),
      onclick: b.getAttribute('onclick'),
    }));
    return { body: body.substring(0, 400), inputs, links, buttons };
  });
  
  console.log('\n📋 Modal conteúdo:');
  console.log(`   ${info.body.substring(0, 250)}`);
  console.log('\n   Inputs:', JSON.stringify(info.inputs, null, 2));
  console.log('\n   Links:', JSON.stringify(info.links, null, 2));
  console.log('\n   Botões:', JSON.stringify(info.buttons, null, 2));
  
  // Testar busca de curso
  console.log('\n🔍 Buscando curso "Design Centrado"...');
  const searchInput = await cursoFrame.$('input[type="text"]');
  if (searchInput) {
    await searchInput.fill('Design Centrado');
    await cursoFrame.evaluate(() => {
      const form = document.querySelector('form');
      if (form) (form as HTMLFormElement).submit();
      else {
        const btns = document.querySelectorAll('input[type="button"], button, a, img');
        for (const b of btns) {
          const v = (b as HTMLInputElement).value || (b as HTMLImageElement).src || '';
          if (v.toLowerCase().includes('pesquisar') || v.toLowerCase().includes('lupa')) {
            (b as HTMLElement).click(); return;
          }
        }
      }
    });
    await page.waitForTimeout(5000);
    
    const after = await cursoFrame.evaluate(() => {
      const body = document.body.textContent || '';
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        text: (a.textContent || '').trim().substring(0, 80),
        onclick: a.getAttribute('onclick'),
      })).filter(x => x.text || x.onclick);
      return { body: body.substring(0, 400), links };
    });
    console.log(`   ${after.body.substring(0, 250)}`);
    console.log('   Links:', JSON.stringify(after.links, null, 2));
  }
  
  await nav.takeSnapshot('diag_curso3');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
