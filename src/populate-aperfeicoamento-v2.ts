/**
 * Adiciona Aperfeiçoamento: Design Centrado no Usuário, UFPR, 2025
 * 
 * FLUXO COMPLETO:
 * 1. f_inst via lupa (busca "Universidade Federal do Paraná")
 * 2. curso() → modal select → se curso não existe, novocurso() → f_dsc_curso + f_area → Confirmar
 * 3. F_STATUS radio S (concluído)
 * 4. f_ano_ini/f_ano_fim
 * 5. f_titulo
 * 6. Salvar
 * 
 * Uso: npx tsx src/populate-aperfeicoamento-v2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const ENTRY = {
  nivel: 'Aperfeiçoamento',
  curso: 'Design Centrado no Usuário',
  instituicao: 'Universidade Federal do Paraná',
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

/** Seleciona ou cadastra o curso no modal prc_curso */
async function selectOrCreateCourse(page: Page, formFrame: Frame, courseName: string): Promise<boolean> {
  console.log('   🎓 Abrindo modal de curso...');
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);
  
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) {
    console.log('   ❌ Modal curso não abriu');
    return false;
  }
  
  // 1. Verificar select com cursos existentes
  const options = await cursoFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
    if (!sel) return null;
    return Array.from(sel.options).map(o => ({ value: o.value, text: (o.textContent || '').trim() }))
      .filter(o => o.value && o.text.length > 3);
  });
  
  if (options && options.length > 0) {
    // Buscar curso pelo nome (case-insensitive)
    const match = options.find(o => o.text.toLowerCase().includes(courseName.toLowerCase()));
    if (match) {
      console.log(`   ✅ Curso encontrado no select: "${match.text}"`);
      await cursoFrame.selectOption('select[name="f_curso"]', match.value);
      // Confirmar seleção
      const confirmBtn = await cursoFrame.$('a[onclick*="check"], input[value="Confirmar"], button:has-text("Confirmar")');
      if (confirmBtn) {
        await confirmBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
      return true;
    }
  }
  
  // 2. Curso não existe — cadastrar novo via novocurso()
  console.log(`   🆕 Curso não encontrado — cadastrando "${courseName}"...`);
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);
  
  // Preencher f_dsc_curso
  await fillFast(cursoFrame, 'f_dsc_curso', courseName);
  console.log('   ✅ f_dsc_curso preenchido');
  
  // f_area — preencher via área genérica (Design)
  // A área tem lupa area() — tentar preencher direto
  const areaVal = await cursoFrame.evaluate(() => {
    const inp = document.querySelector('input[name="f_area"]') as HTMLInputElement | null;
    if (inp) {
      inp.removeAttribute('disabled');
      inp.value = 'Design';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return inp.value;
    }
    return null;
  });
  console.log(`   ${areaVal ? '✅' : '⚠️'} f_area = "${areaVal}"`);
  
  // Confirmar cadastro do curso
  console.log('   💾 Confirmando novo curso...');
  const confirmBtn = await cursoFrame.$('a[onclick*="check"], input[value="Confirmar"], button:has-text("Confirmar")');
  if (confirmBtn) {
    await confirmBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
    console.log('   ✅ Confirmado');
    return true;
  } else {
    console.log('   ⚠️ Botão Confirmar não encontrado — tentando check()');
    await cursoFrame.evaluate(() => { (window as any).check?.(); }).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  }
}

async function main() {
  console.log(`🎓 Aperfeiçoamento v2: ${ENTRY.curso} @ UFPR\n`);

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

  // 2. Curso (selecionar ou cadastrar)
  await selectOrCreateCourse(page, formFrame, ENTRY.curso);

  // Verificar f_curso
  const cursoVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
  console.log(`   f_curso = "${cursoVal}"`);

  // 3. Anos
  await fillFast(formFrame, 'f_ano_ini', ENTRY.anoInicio);
  await fillFast(formFrame, 'f_ano_fim', ENTRY.anoFim);
  console.log(`✅ Anos: ${ENTRY.anoInicio}-${ENTRY.anoFim}`);

  // 4. Status
  const statusRadio = await formFrame.$(`input[name="F_STATUS"][value="${ENTRY.status}"]`);
  if (statusRadio) {
    await statusRadio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    console.log(`✅ F_STATUS = ${ENTRY.status}`);
  }

  // 5. Título
  await fillFast(formFrame, 'f_titulo', ENTRY.curso);
  console.log(`✅ f_titulo = ${ENTRY.curso}`);

  // 6. Salvar
  await nav.takeSnapshot('aperf2_pre_save');
  console.log('💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

  if (!saveResult.success) {
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }

  await nav.takeSnapshot('aperf2_post_save');
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
