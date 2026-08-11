/**
 * Adiciona Aperfeiçoamento: Design Centrado no Usuário, UFPR, 2025
 * 
 * FLUXO COMPLETO CORRIGIDO:
 * 1. f_inst via lupa (busca "Universidade Federal do Paraná")
 * 2. curso() → modal select → novocurso() → preencher f_dsc_curso → area() → 
 *    expandir Ciências Sociais Aplicadas → clicar "Desenho Industrial" → check()
 * 3. Voltar ao select → selecionar curso novo → fechar modal
 * 4. F_STATUS radio S (concluído), f_ano_ini/f_ano_fim, f_titulo
 * 5. Salvar
 * 
 * Uso: npx tsx src/populate-aperfeicoamento-v3.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const ENTRY = {
  nivel: 'Aperfeiçoamento',
  curso: 'Design Centrado no Usuário',
  instituicao: 'Universidade Federal do Paraná',
  area: 'Desenho Industrial',
  anoInicio: '2025',
  anoFim: '2025',
  status: 'S',
};

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

async function fillFast(frame: Frame, name: string, value: string): Promise<boolean> {
  try {
    const el = await frame.$(`input[name="${name}"], textarea[name="${name}"]`);
    if (!el) return false;
    await el.evaluate((e: HTMLInputElement, v: string) => {
      e.removeAttribute('disabled');
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    return true;
  } catch {
    return false;
  }
}

/** Seleciona a área do conhecimento na árvore */
async function selectArea(page: Page, areaFrame: Frame, areaName: string): Promise<boolean> {
  // Expandir Ciências Sociais Aplicadas (F_GR=60000007) — onde fica Desenho Industrial
  console.log('   🔍 Expandindo Ciências Sociais Aplicadas...');
  await areaFrame.evaluate(() => {
    const link = document.querySelector('a[href*="F_GR=60000007"]') as HTMLElement;
    if (link) link.click();
  });
  await page.waitForTimeout(4000);
  
  // Clicar no link com check() que contém o nome da área
  console.log(`   🎯 Selecionando área "${areaName}"...`);
  const clicked = await areaFrame.evaluate((name: string) => {
    const links = document.querySelectorAll('a[onclick*="check("]');
    for (const link of links) {
      const text = (link.textContent || '').trim();
      if (text.toLowerCase().includes(name.toLowerCase())) {
        (link as HTMLElement).click();
        return { clicked: true, text };
      }
    }
    return { clicked: false };
  }, areaName);
  
  if (!clicked.clicked) {
    console.log('   ❌ Área não encontrada na árvore');
    return false;
  }
  console.log(`   ✅ Área selecionada: ${clicked.text}`);
  await page.waitForTimeout(3000);
  return true;
}

async function main() {
  console.log(`🎓 Aperfeiçoamento v3: ${ENTRY.curso} @ UFPR\n`);

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
  if (!listFrame) { console.log('❌ Lista não encontrada'); await session.close(); return; }

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
  if (!aperf) { console.log('❌ Nível Aperfeiçoamento não encontrado'); await session.close(); return; }
  console.log(`✅ Nível: ${aperf.name}`);

  await listFrame.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, aperf.url);
  await page.waitForTimeout(5000);

  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form não encontrado'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  // 1. Instituição
  console.log(`🏫 Instituição: ${ENTRY.instituicao}`);
  await nav.fillLupa('f_inst', ENTRY.instituicao, formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`   f_inst = "${instVal}"`);
  if (!instVal) { console.log('   ❌ Instituição não preenchida'); await session.close(); return; }

  // 2. Abrir modal de curso
  console.log(`\n🎓 Abrindo modal de curso...`);
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);

  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) { console.log('   ❌ Modal curso não abriu'); await session.close(); return; }
  console.log(`   ✅ Modal: ${cursoFrame.url()}`);

  // Verificar se curso já existe no select
  const opts = await cursoFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
    if (!sel) return null;
    return Array.from(sel.options).map(o => ({ value: o.value.trim(), text: (o.textContent || '').trim() }))
      .filter(o => o.value && o.text.length > 3);
  });
  const existing = opts?.find(o => o.text.toLowerCase().includes(ENTRY.curso.toLowerCase()));

  if (existing) {
    console.log(`   ✅ Curso já existe no select: "${existing.text}"`);
    await cursoFrame.selectOption('select[name="f_curso"]', existing.value);
    // Fechar modal
    await cursoFrame.evaluate(() => { (window as any).voltar?.(); }).catch(() => {});
    await page.waitForTimeout(2000);
  } else {
    // 3. Cadastrar novo curso
    console.log(`\n🆕 Cadastrando novo curso...`);
    await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
    await page.waitForTimeout(3000);

    // Preencher NOME DO CURSO ANTES da área (obrigatório para check())
    await fillFast(cursoFrame, 'f_dsc_curso', ENTRY.curso);
    console.log('   ✅ Nome do curso preenchido');

    // Abrir área
    console.log('   📂 Abrindo árvore de áreas...');
    await cursoFrame.evaluate(() => { (window as any).area?.(); });
    await page.waitForTimeout(4000);

    let areaFrame: Frame | null = null;
    for (const f of page.frames()) {
      if (f.url().includes('prc_area_curso')) { areaFrame = f; break; }
    }
    if (!areaFrame) { console.log('   ❌ Árvore de áreas não abriu'); await session.close(); return; }
    console.log(`   ✅ Árvore: ${areaFrame.url()}`);

    // Selecionar área
    await selectArea(page, areaFrame, ENTRY.area);

    // Verificar f_area no form de curso
    const fArea = await cursoFrame.evaluate(() => {
      const inp = document.querySelector('input[name="f_area"]') as HTMLInputElement | null;
      return inp ? inp.value : null;
    }).catch(() => null);
    console.log(`   f_area = "${fArea}"`);

    // Confirmar curso (check())
    console.log('   💾 Confirmando novo curso...');
    await cursoFrame.evaluate(() => { (window as any).check?.(); });
    await page.waitForTimeout(3000);

    // Voltar ao select — selecionar o curso recém-criado
    console.log('   📋 Verificando select...');
    let newOpts: Array<{ value: string; text: string }> = [];
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
        if (state.hasSelect) {
          newOpts = state.opts;
          cursoFrame = f;
        }
        break;
      }
    }

    const novoCurso = newOpts.find(o => o.text.toLowerCase().includes(ENTRY.curso.toLowerCase()));
    if (novoCurso) {
      console.log(`   ✅ Curso criado: "${novoCurso.text}" (${novoCurso.value})`);
      await cursoFrame.selectOption('select[name="f_curso"]', novoCurso.value);
      await page.waitForTimeout(1000);
      // Fechar modal do curso
      await cursoFrame.evaluate(() => { (window as any).voltar?.(); }).catch(() => {});
      await page.waitForTimeout(2000);
    } else {
      console.log('   ⚠️ Curso não apareceu no select — continuando');
    }
  }

  // Verificar f_curso no form
  const cursoVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
  console.log(`   f_curso = "${cursoVal}"`);

  // 4. Anos
  await fillFast(formFrame, 'f_ano_ini', ENTRY.anoInicio);
  await fillFast(formFrame, 'f_ano_fim', ENTRY.anoFim);
  console.log(`✅ Anos: ${ENTRY.anoInicio}-${ENTRY.anoFim}`);

  // 5. Status
  const statusRadio = await formFrame.$(`input[name="F_STATUS"][value="${ENTRY.status}"]`);
  if (statusRadio) {
    await statusRadio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    console.log(`✅ F_STATUS = ${ENTRY.status}`);
  }

  // 6. Título
  await fillFast(formFrame, 'f_titulo', ENTRY.curso);
  console.log(`✅ f_titulo = ${ENTRY.curso}`);

  // 7. Salvar
  await nav.takeSnapshot('aperf3_pre_save');
  console.log('💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

  if (!saveResult.success) {
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }

  await nav.takeSnapshot('aperf3_post_save');
  await nav.closeModal();
  await page.waitForTimeout(2000);

  // Verificar lista
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`\n📋 Registros: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`   • ${r.text.substring(0, 150)}`);
    }
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
