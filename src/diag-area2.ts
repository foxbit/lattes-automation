/**
 * DIAGNÓSTICO 8: árvore de áreas de conhecimento (DOM)
 * Uso: npx tsx src/diag-area2.ts
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
  console.log('🔬 DIAG 8: árvore de áreas\n');
  
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
  
  // curso() → novocurso() → area()
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('❌ curso'); await session.close(); return; }
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);
  await cursoFrame.evaluate(() => { (window as any).area?.(); });
  await page.waitForTimeout(4000);
  
  let areaFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_area_curso')) { areaFrame = f; break; }
  }
  if (!areaFrame) { console.log('❌ area'); await session.close(); return; }
  console.log(`✅ Área: ${areaFrame.url()}`);
  
  // Inspecionar DOM da árvore
  const tree = await areaFrame.evaluate(() => {
    // Todos os elementos com texto que parecem nós da árvore
    const all = Array.from(document.querySelectorAll('a, td, span, div, img, li'));
    const items: Array<{ tag: string; text: string; onclick: string | null; src: string; className: string; id: string }> = [];
    for (const el of all) {
      const text = (el.textContent || '').trim();
      const oc = el.getAttribute('onclick');
      const src = (el as HTMLImageElement).src || '';
      const cls = el.className || '';
      if (text.length > 2 || oc || src.includes('mais') || src.includes('menos') || src.includes('pasta')) {
        items.push({
          tag: el.tagName,
          text: text.substring(0, 60),
          onclick: oc,
          src: src.substring(0, 60),
          className: cls.substring(0, 40),
          id: el.id,
        });
      }
    }
    // Dedupe
    const seen = new Set<string>();
    const unique = items.filter(i => {
      const key = `${i.tag}|${i.text}|${i.onclick}|${i.src}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.slice(0, 40);
  });
  
  console.log('\n📋 Elementos da árvore:');
  for (const t of tree) {
    console.log(`   <${t.tag}> "${t.text}" onclick="${t.onclick}" src="${t.src}" class="${t.className}" id="${t.id}"`);
  }
  
  // Procurar link "+" ou expandir
  console.log('\n🔍 Procurando mecanismo de expansão...');
  const expandInfo = await areaFrame.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img')).map(i => ({
      src: i.src.substring(0, 80),
      alt: i.alt,
      onclick: i.getAttribute('onclick') || i.parentElement?.getAttribute('onclick') || '',
    }));
    return imgs;
  });
  console.log('   Imagens:', JSON.stringify(expandInfo, null, 2));
  
  await nav.takeSnapshot('diag_area2');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
