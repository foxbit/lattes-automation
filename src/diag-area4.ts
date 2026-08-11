/**
 * DIAGNÓSTICO 10: navegar árvore de áreas até Design
 * Uso: npx tsx src/diag-area4.ts
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

/** Lê os itens do nível atual da árvore */
async function readTreeItems(areaFrame: Frame) {
  return areaFrame.evaluate(() => {
    const items: Array<{ text: string; href: string; isLeaf: boolean }> = [];
    // Padrão: <a href="PRC_AREA_CURSO?...F_GR=..."><img plus></a> Nome<br>
    // Texto do nó = nextSibling (text node) do link, até <br>
    const links = document.querySelectorAll('a');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      if (!href.includes('PRC_AREA_CURSO')) continue;
      
      let text = '';
      const next = link.nextSibling;
      if (next && next.nodeType === Node.TEXT_NODE) {
        text = (next.textContent || '').trim();
      }
      if (!text) {
        // fallback: textContent do parent até <br>
        const parent = link.parentElement;
        if (parent) {
          const clone = parent.cloneNode(true) as HTMLElement;
          // remove o link (imagem)
          const a = clone.querySelector('a');
          if (a) a.remove();
          text = (clone.textContent || '').trim();
        }
      }
      items.push({ text: text.substring(0, 80), href, isLeaf: false });
    }
    return items;
  });
}

async function expandNode(areaFrame: Frame, href: string) {
  await areaFrame.evaluate((h: string) => {
    const link = document.querySelector(`a[href="${h}"]`) as HTMLElement;
    if (link) link.click();
  }, href);
}

async function main() {
  console.log('🔬 DIAG 10: navegar árvore até Design\n');
  
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
  
  // Nível 1: grandes áreas
  console.log('\n📋 Nível 1 (grandes áreas):');
  let items = await readTreeItems(areaFrame);
  for (const i of items) console.log(`   ${i.isLeaf ? '🗹' : '[+]'} ${i.text} — ${i.href}`);
  
  // Expandir "Ciências Sociais Aplicadas"
  const csAplicadas = items.find(i => i.text.toLowerCase().includes('sociais aplicadas'));
  if (csAplicadas) {
    console.log(`\n🔍 Expandindo: ${csAplicadas.text}`);
    await expandNode(areaFrame, csAplicadas.href);
    await page.waitForTimeout(3000);
    
    items = await readTreeItems(areaFrame);
    console.log('\n📋 Nível 2:');
    for (const i of items) console.log(`   ${i.isLeaf ? '🗹' : '[+]'} ${i.text} — ${i.href}`);
    
    // Expandir "Desenho Industrial" se existir
    const desenho = items.find(i => i.text.toLowerCase().includes('desenho industrial'));
    if (desenho) {
      console.log(`\n🔍 Expandindo: ${desenho.text}`);
      await expandNode(areaFrame, desenho.href);
      await page.waitForTimeout(3000);
      
      items = await readTreeItems(areaFrame);
      console.log('\n📋 Nível 3:');
      for (const i of items) console.log(`   ${i.isLeaf ? '🗹' : '[+]'} ${i.text} — ${i.href}`);
      
      // Procurar Design
      const design = items.find(i => i.text.toLowerCase().includes('design'));
      if (design) {
        console.log(`\n🎯 Design encontrado: ${design.text}`);
        if (design.isLeaf) {
          console.log('   É folha — clicar para selecionar');
          await expandNode(areaFrame, design.href).catch(() => {});
        } else {
          console.log('   Tem filhos — expandindo');
          await expandNode(areaFrame, design.href);
          await page.waitForTimeout(3000);
          items = await readTreeItems(areaFrame);
          console.log('\n📋 Nível 4:');
          for (const i of items) console.log(`   ${i.isLeaf ? '🗹' : '[+]'} ${i.text} — ${i.href}`);
        }
      }
    }
  }
  
  await nav.takeSnapshot('diag_area4');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
