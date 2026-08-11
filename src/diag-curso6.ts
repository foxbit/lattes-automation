/**
 * DIAGNÓSTICO 6: cadastro de curso com área via lupa area()
 * Uso: npx tsx src/diag-curso6.ts
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
  console.log('🔬 DIAG 6: curso com área via lupa\n');
  
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
  
  // Abrir curso()
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('❌ Modal curso'); await session.close(); return; }
  
  // novocurso()
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);
  
  // Preencher nome do curso
  await cursoFrame.evaluate(() => {
    const inp = document.querySelector('input[name="f_dsc_curso"]') as HTMLInputElement;
    if (inp) {
      inp.value = 'Teste Curso Area Lupa';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  console.log('✅ Nome do curso preenchido');
  
  // Abrir lupa de área: o link tem onclick="area()"
  console.log('\n🔎 Abrindo lupa de área (area())...');
  await cursoFrame.evaluate(() => { (window as any).area?.(); });
  await page.waitForTimeout(4000);
  
  // Listar frames
  console.log('\n📋 Frames:');
  for (const f of page.frames()) {
    if (f.url().includes('prc_') || f.url().includes('area')) console.log(`   • ${f.url()}`);
  }
  
  // Procurar frame de área
  let areaFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_area') || f.url().toLowerCase().includes('area')) { areaFrame = f; break; }
  }
  
  if (areaFrame) {
    console.log(`✅ Modal área: ${areaFrame.url()}`);
    
    const info = await areaFrame.evaluate(() => {
      const body = document.body.textContent || '';
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type,
        value: ((i as HTMLInputElement).value || '').substring(0, 40),
      }));
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        text: (a.textContent || '').trim().substring(0, 80),
        onclick: a.getAttribute('onclick'),
      })).filter(x => x.text || x.onclick);
      const selects = Array.from(document.querySelectorAll('select')).map(s => ({
        name: (s as HTMLSelectElement).name,
        options: Array.from((s as HTMLSelectElement).options).map(o => o.textContent?.trim()).slice(0, 10),
      }));
      return { body: body.substring(0, 300), inputs, links, selects };
    });
    
    console.log('\n   Inputs:', JSON.stringify(info.inputs, null, 2));
    console.log('\n   Links:', JSON.stringify(info.links, null, 2));
    console.log('\n   Selects:', JSON.stringify(info.selects, null, 2));
    
    // Buscar "Design" na área
    console.log('\n🔍 Buscando área "Design"...');
    const searchInput = await areaFrame.$('input[type="text"]');
    if (searchInput) {
      await searchInput.fill('Design');
      await areaFrame.evaluate(() => {
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
      
      const after = await areaFrame.evaluate(() => {
        const body = document.body.textContent || '';
        const links = Array.from(document.querySelectorAll('a')).map(a => ({
          text: (a.textContent || '').trim().substring(0, 80),
          onclick: a.getAttribute('onclick'),
        })).filter(x => x.text || x.onclick);
        return { body: body.substring(0, 300), links };
      });
      console.log(`   ${after.body.substring(0, 200)}`);
      console.log('   Links:', JSON.stringify(after.links.slice(0, 10), null, 2));
      
      // Clicar no resultado "Design"
      const designLink = await areaFrame.$('a:has-text("Design")');
      if (designLink) {
        await designLink.click();
        console.log('   ✅ Área Design selecionada');
        await page.waitForTimeout(2000);
      }
    }
    
    // Voltar ao modal de curso e confirmar
    console.log('\n💾 Confirmando curso...');
    const checkLink = await cursoFrame.$('a[onclick*="check"], a:has-text("Confirmar")');
    if (checkLink) {
      await checkLink.click();
      console.log('   ✅ check() clicado');
      await page.waitForTimeout(3000);
    } else {
      await cursoFrame.evaluate(() => { (window as any).check?.(); });
      console.log('   ✅ check() via JS');
      await page.waitForTimeout(3000);
    }
    
    // Verificar estado
    const state = await cursoFrame.evaluate(() => {
      const body = document.body.textContent || '';
      const hasSelect = !!document.querySelector('select[name="f_curso"]');
      const hasDsc = !!document.querySelector('input[name="f_dsc_curso"]');
      return { body: body.substring(0, 200), hasSelect, hasDsc };
    });
    console.log(`   hasSelect=${state.hasSelect} hasDsc=${state.hasDsc}`);
    console.log(`   Body: ${state.body.substring(0, 150)}`);
    
    if (state.hasSelect) {
      const opts = await cursoFrame.evaluate(() => {
        const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
        return sel ? Array.from(sel.options).map(o => ({ value: o.value.trim(), text: (o.textContent || '').trim() })) : null;
      });
      console.log('\n📋 Select após cadastro:');
      for (const o of (opts || []).filter(o => o.value && o.text.length > 3)) {
        console.log(`   ${o.value} = ${o.text}`);
      }
      
      // Selecionar o curso novo
      const novo = opts?.find(o => o.text.toLowerCase().includes('teste curso area'));
      if (novo) {
        console.log(`\n✅ Selecionando "${novo.text}"...`);
        await cursoFrame.selectOption('select[name="f_curso"]', novo.value);
        await page.waitForTimeout(1000);
        
        // Fechar modal (X ou Voltar)
        const closeBtn = await cursoFrame.$('a[onclick*="fechar"], a[onclick*="close"], input[value="OK"]');
        if (closeBtn) {
          await closeBtn.click().catch(() => {});
        }
        await page.waitForTimeout(2000);
        
        const fCurso = await formFrame.evaluate(() =>
          (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
        console.log(`   f_curso no form = "${fCurso}"`);
      }
    }
  } else {
    console.log('❌ Modal área não encontrado');
  }
  
  await nav.takeSnapshot('diag_curso6');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
