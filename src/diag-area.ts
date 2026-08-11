/**
 * DIAGNÓSTICO 7: modal prc_area_curso (busca de área)
 * Uso: npx tsx src/diag-area.ts
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
  console.log('🔬 DIAG 7: modal prc_area_curso\n');
  
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
  await nav.fillLupa('f_inst', 'Universidade Federal do Paraná', formFrame);
  
  // curso()
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  
  // Encontrar frame do curso
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('❌ Modal curso não encontrado'); await session.close(); return; }
  console.log(`✅ Modal curso: ${cursoFrame.url()}`);
  
  // novocurso() no frame do curso
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);
  
  // area() no frame do curso
  console.log('\n🔎 area()...');
  await cursoFrame.evaluate(() => { (window as any).area?.(); });
  await page.waitForTimeout(4000);
  
  // Encontrar prc_area_curso especificamente
  let areaFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_area_curso')) { areaFrame = f; break; }
  }
  if (!areaFrame) {
    console.log('❌ prc_area_curso não encontrado');
    for (const f of page.frames()) console.log(`   frame: ${f.url()}`);
    await session.close();
    return;
  }
  console.log(`✅ prc_area_curso: ${areaFrame.url()}`);
  
  // Inspecionar
  const info = await areaFrame.evaluate(() => {
    const body = document.body.textContent || '';
    const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
      name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type,
      value: ((i as HTMLInputElement).value || '').substring(0, 40),
    }));
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 100),
      onclick: a.getAttribute('onclick'),
    })).filter(x => x.text || x.onclick);
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
      name: (s as HTMLSelectElement).name,
      options: Array.from((s as HTMLSelectElement).options).map(o => ({ value: o.value, text: o.textContent?.trim() })),
    }));
    const buttons = Array.from(document.querySelectorAll('input[type="button"], button')).map(b => ({
      value: (b as HTMLInputElement).value || (b.textContent || '').trim(),
      onclick: b.getAttribute('onclick'),
    }));
    return { body: body.substring(0, 400), inputs, links, selects, buttons };
  });
  
  console.log('\n📋 Conteúdo:');
  console.log(`   ${info.body.substring(0, 250)}`);
  console.log('\n   Inputs:', JSON.stringify(info.inputs, null, 2));
  console.log('\n   Selects:', JSON.stringify(info.selects, null, 2));
  console.log('\n   Links:', JSON.stringify(info.links, null, 2));
  console.log('\n   Botões:', JSON.stringify(info.buttons, null, 2));
  
  // Buscar "Design"
  console.log('\n🔍 Buscando "Design"...');
  const searchInput = await areaFrame.$('input[type="text"]');
  if (searchInput) {
    await searchInput.fill('Design');
    await areaFrame.evaluate(() => {
      const form = document.querySelector('form');
      if (form) (form as HTMLFormElement).submit();
    });
    await page.waitForTimeout(6000);
    
    const after = await areaFrame.evaluate(() => {
      const body = document.body.textContent || '';
      const found = body.match(/Foram encontrados[^<]{0,50}/);
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        text: (a.textContent || '').trim().substring(0, 100),
        onclick: a.getAttribute('onclick'),
      })).filter(x => x.text || x.onclick);
      return { found: found ? found[0] : null, body: body.substring(0, 300), links };
    });
    console.log(`   ${after.found || 'sem msg'}`);
    console.log('   Links:', JSON.stringify(after.links.slice(0, 10), null, 2));
    
    // Selecionar resultado "Design"
    const designLink = await areaFrame.$('a:has-text("Design")');
    if (designLink) {
      const text = await designLink.textContent();
      console.log(`\n✅ Clicando: "${text?.trim()}"`);
      await designLink.click();
      await page.waitForTimeout(2000);
      
      // Verificar f_area no form de curso
      const fArea = await formFrame.evaluate(() => {
        const inp = document.querySelector('input[name="f_area"]') as HTMLInputElement | null;
        return inp ? inp.value : null;
      });
      console.log(`   f_area = "${fArea}"`);
    }
  }
  
  await nav.takeSnapshot('diag_area');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
