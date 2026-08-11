/**
 * DIAGNÓSTICO 4: opções do select de curso + fluxo novocurso()
 * Uso: npx tsx src/diag-curso4.ts
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
  console.log('🔬 DIAG 4: select curso + novocurso()\n');
  
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
  
  // UFPR
  console.log('🏫 UFPR...');
  await nav.fillLupa('f_inst', 'Universidade Federal do Paraná', formFrame);
  
  // Abrir curso()
  console.log('\n🎓 Abrindo curso()...');
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('❌ Modal curso'); await session.close(); return; }
  console.log(`✅ Modal: ${cursoFrame.url()}`);
  
  // 1. Listar opções do select f_curso
  const options = await cursoFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
    if (!sel) return null;
    return Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent?.trim() }));
  });
  console.log(`\n📋 Opções do select f_curso (${options?.length || 0}):`);
  if (options) {
    for (const o of options.slice(0, 40)) console.log(`   ${o.value} = ${o.text}`);
  }
  
  // 2. Testar novocurso()
  console.log('\n🆕 Testando novocurso()...');
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);
  
  // Verificar se mudou de tela
  const after = await cursoFrame.evaluate(() => {
    const body = document.body.textContent || '';
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
      tag: i.tagName, name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type || 'select',
      value: ((i as HTMLInputElement).value || '').substring(0, 40),
    }));
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 60),
      onclick: a.getAttribute('onclick'),
    })).filter(x => x.text || x.onclick);
    const buttons = Array.from(document.querySelectorAll('input[type="button"], button')).map(b => ({
      value: (b as HTMLInputElement).value || (b.textContent || '').trim(),
      onclick: b.getAttribute('onclick'),
    }));
    return { body: body.substring(0, 500), inputs, links, buttons };
  });
  
  console.log('\n📋 Após novocurso():');
  console.log(`   ${after.body.substring(0, 300)}`);
  console.log('\n   Inputs:', JSON.stringify(after.inputs, null, 2));
  console.log('\n   Links:', JSON.stringify(after.links, null, 2));
  console.log('\n   Botões:', JSON.stringify(after.buttons, null, 2));
  
  await nav.takeSnapshot('diag_curso4');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
