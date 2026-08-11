/**
 * DIAGNÓSTICO 12: selecionar área "Desenho Industrial" e concluir curso
 * Uso: npx tsx src/diag-area6.ts
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
  console.log('🔬 DIAG 12: selecionar área e concluir\n');
  
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
  
  // 1. Expandir Ciências Sociais Aplicadas
  console.log('\n🔍 Expandindo Ciências Sociais Aplicadas...');
  await areaFrame.evaluate(() => {
    const link = document.querySelector('a[href*="F_GR=60000007"]') as HTMLElement;
    if (link) link.click();
  });
  await page.waitForTimeout(4000);
  
  // 2. Clicar "Desenho Industrial" (link com check())
  console.log('🎯 Clicando Desenho Industrial...');
  const clicked = await areaFrame.evaluate(() => {
    const links = document.querySelectorAll('a[onclick*="check("]');
    for (const link of links) {
      const text = (link.textContent || '').trim();
      if (text.toLowerCase().includes('desenho industrial')) {
        (link as HTMLElement).click();
        return { clicked: true, text, onclick: link.getAttribute('onclick') };
      }
    }
    return { clicked: false };
  });
  console.log(`   ${clicked.clicked ? '✅' : '❌'} ${clicked.text} — ${clicked.onclick}`);
  await page.waitForTimeout(3000);
  
  // 3. Verificar f_area no form de curso (prc_curso_outro ou prc_curso_form)
  let fArea: string | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) {
      const val = await f.evaluate(() => {
        const inp = document.querySelector('input[name="f_area"]') as HTMLInputElement | null;
        return inp ? inp.value : null;
      }).catch(() => null);
      if (val) { fArea = val; break; }
    }
  }
  console.log(`   f_area = "${fArea}"`);
  
  // 4. Confirmar o curso (check() no frame do curso)
  console.log('\n💾 Confirmando curso...');
  let cursoFrame2: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame2 = f; break; }
  }
  if (cursoFrame2) {
    await cursoFrame2.evaluate(() => { (window as any).check?.(); });
    await page.waitForTimeout(3000);
    console.log('   ✅ check() executado');
  }
  
  // 5. Verificar estado — voltou ao select?
  let hasSelect = false;
  let selectOpts: Array<{ value: string; text: string }> = [];
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) {
      const state = await f.evaluate(() => {
        const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
        if (!sel) return { hasSelect: false, opts: [] };
        return {
          hasSelect: true,
          opts: Array.from(sel.options).map(o => ({ value: o.value.trim(), text: (o.textContent || '').trim() })),
        };
      }).catch(() => ({ hasSelect: false, opts: [] }));
      hasSelect = state.hasSelect;
      selectOpts = state.opts;
      break;
    }
  }
  console.log(`\n📋 Select presente? ${hasSelect}`);
  if (hasSelect) {
    for (const o of selectOpts.filter(o => o.value && o.text.length > 3)) {
      console.log(`   ${o.value} = ${o.text}`);
    }
    
    // 6. Selecionar o curso recém-criado (Teste/Design)
    const novo = selectOpts.find(o => o.text.toLowerCase().includes('design centrado'));
    if (novo) {
      console.log(`\n🎯 Selecionando "${novo.text}"...`);
      await cursoFrame2?.selectOption('select[name="f_curso"]', novo.value);
      await page.waitForTimeout(1000);
      
      // 7. Fechar modal do curso (voltar)
      const closeBtn = await cursoFrame2?.$('a[onclick*="voltar"], a[onclick*="fechar"], input[value="OK"], a:has-text("OK")');
      if (closeBtn) {
        await closeBtn.click().catch(() => {});
      } else {
        await cursoFrame2?.evaluate(() => { (window as any).voltar?.(); }).catch(() => {});
      }
      await page.waitForTimeout(2000);
      
      // 8. Verificar f_curso no form principal
      const fCurso = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
      console.log(`   f_curso no form = "${fCurso}"`);
    } else {
      console.log('   ⚠️ Curso recém-criado não apareceu no select');
      const allText = await cursoFrame2?.evaluate(() => document.body.textContent?.substring(0, 300));
      console.log(`   Body: ${allText}`);
    }
  }
  
  await nav.takeSnapshot('diag_area6');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
