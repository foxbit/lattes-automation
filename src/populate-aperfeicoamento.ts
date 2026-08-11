/**
 * Adiciona Aperfeiçoamento: Design Centrado no Usuário, UFPR, 2025
 * Termo de busca correto: "UFPR" (retorna Universidade Federal do Paraná)
 * Uso: npx tsx src/populate-aperfeicoamento.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const ENTRY = {
  nivel: 'Aperfeiçoamento',
  curso: 'Design Centrado no Usuário',
  instituicao: 'Universidade Federal do Paraná',  // nome completo (sigla não está no texto do resultado)
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

async function main() {
  console.log(`🎓 Adicionando Aperfeiçoamento: ${ENTRY.curso} @ UFPR\n`);

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

  // Abrir Aperfeiçoamento
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

  // 1. Instituição via lupa — termo "UFPR"
  console.log(`🏫 Instituição: ${ENTRY.instituicao}`);
  const lupaInst = await nav.fillLupa('f_inst', ENTRY.instituicao, formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`   f_inst = "${instVal}" (lupa: ${lupaInst.success ? 'ok' : 'falhou'})`);

  if (!instVal) {
    console.log('   ❌ Instituição não preenchida — abortando');
    await session.close();
    return;
  }

  // 2. Curso via lupa (curso) — pode falhar; fallback direto
  console.log(`🎓 Curso: ${ENTRY.curso}`);
  const lupaCurso = await nav.fillLupa('f_curso', ENTRY.curso, formFrame);
  const cursoVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
  console.log(`   f_curso = "${cursoVal}" (lupa: ${lupaCurso.success ? 'ok' : 'falhou'})`);
  if (!cursoVal) {
    await fillFast(formFrame, 'f_curso', ENTRY.curso);
    console.log('   ⚠️  Curso preenchido direto');
  }

  // 3. Anos
  await fillFast(formFrame, 'f_ano_ini', ENTRY.anoInicio);
  await fillFast(formFrame, 'f_ano_fim', ENTRY.anoFim);
  console.log(`✅ Anos: ${ENTRY.anoInicio}-${ENTRY.anoFim}`);

  // 4. Status (radio F_STATUS: N=em andamento, S=concluído, I=incompleto)
  console.log('📻 Status do curso...');
  const statusRadio = await formFrame.$(`input[name="F_STATUS"][value="${ENTRY.status}"]`);
  if (statusRadio) {
    await statusRadio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    console.log(`   ✅ F_STATUS = ${ENTRY.status}`);
  } else {
    console.log('   ❌ radio F_STATUS não encontrado');
  }

  // 5. Título (obrigatório para Aperfeiçoamento)
  console.log('📝 Título...');
  const tituloOk = await fillFast(formFrame, 'f_titulo', ENTRY.curso);
  console.log(`   ${tituloOk ? '✅' : '❌'} f_titulo = ${ENTRY.curso}`);

  // Screenshot antes
  await nav.takeSnapshot('aperf_pre_save');

  // 5. Salvar
  console.log('💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

  if (!saveResult.success) {
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }

  await nav.takeSnapshot('aperf_post_save');
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
