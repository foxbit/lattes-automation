/**
 * DIAGNÓSTICO 5: após novocurso()+Confirmar, o modal volta ao select?
 * Uso: npx tsx src/diag-curso5.ts
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
  console.log('🔬 DIAG 5: ciclo novocurso → select\n');
  
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
  console.log('\n🎓 curso()...');
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('❌ Modal curso'); await session.close(); return; }
  
  // 1. Select inicial
  const opts1 = await cursoFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
    return sel ? Array.from(sel.options).map(o => ({ value: o.value, text: (o.textContent || '').trim() })) : null;
  });
  console.log('\n📋 Select inicial:', JSON.stringify(opts1?.filter(o => o.value && o.text.length > 3)));
  
  // 2. novocurso()
  console.log('\n🆕 novocurso()...');
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);
  
  // Preencher
  await cursoFrame.evaluate(() => {
    const inp = document.querySelector('input[name="f_dsc_curso"]') as HTMLInputElement;
    if (inp) {
      inp.value = 'Teste Curso Diagnostico XYZ';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const area = document.querySelector('input[name="f_area"]') as HTMLInputElement;
    if (area) {
      area.removeAttribute('disabled');
      area.value = 'Design';
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  console.log('   Campos preenchidos');
  
  // 3. Confirmar (check())
  console.log('\n💾 check()...');
  await cursoFrame.evaluate(() => { (window as any).check?.(); }).catch(() => {});
  await page.waitForTimeout(4000);
  
  // 4. Estado após confirmar
  const state = await cursoFrame.evaluate(() => {
    const body = document.body.textContent || '';
    const hasSelect = !!document.querySelector('select[name="f_curso"]');
    const hasDsc = !!document.querySelector('input[name="f_dsc_curso"]');
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 60),
      onclick: a.getAttribute('onclick'),
    })).filter(x => x.text || x.onclick);
    return { body: body.substring(0, 200), hasSelect, hasDsc, links };
  });
  console.log(`   hasSelect=${state.hasSelect} hasDsc=${state.hasDsc}`);
  console.log(`   Links: ${JSON.stringify(state.links)}`);
  console.log(`   Body: ${state.body.substring(0, 150)}`);
  
  // Se voltou ao select, listar opções
  if (state.hasSelect) {
    const opts2 = await cursoFrame.evaluate(() => {
      const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
      return sel ? Array.from(sel.options).map(o => ({ value: o.value, text: (o.textContent || '').trim() })) : null;
    });
    console.log('\n📋 Select após cadastro:', JSON.stringify(opts2?.filter(o => o.value && o.text.length > 3)));
    
    // Selecionar o curso novo
    const novo = opts2?.find(o => o.text.toLowerCase().includes('teste curso'));
    if (novo) {
      console.log(`\n✅ Curso novo encontrado: "${novo.text}" (${novo.value})`);
      await cursoFrame.selectOption('select[name="f_curso"]', novo.value);
      console.log('   Selecionado no select');
      
      // Fechar modal: procurar botão ok/confirmar/voltar
      await page.waitForTimeout(1000);
      // Clicar em algum link para confirmar seleção — pode ser "Voltar" ou o X
      const okLink = await cursoFrame.$('a[onclick*="fechar"], a[onclick*="close"], input[value="OK"], a:has-text("OK")');
      if (okLink) {
        await okLink.click().catch(() => {});
        console.log('   Modal fechado');
      }
      await page.waitForTimeout(2000);
      
      const fCurso = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
      console.log(`   f_curso no form = "${fCurso}"`);
    }
  }
  
  await nav.takeSnapshot('diag_curso5');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
