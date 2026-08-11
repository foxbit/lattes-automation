/**
 * Adiciona WebEDSI na Formação complementar — fluxo com lupa curso()
 * Uso: npx tsx src/populate-webedsi-v2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const ENTRY = {
  nome: '5º Webinário de Estudos em Design de Sistemas de Informação (WebEDSI)',
  instituicao: 'Universidade Federal do Paraná',
  nivel: 'F',
  cargaHoraria: '8',
};

async function findFormFrame(page: Page, listUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listUrl && url !== page.mainFrame().url() && url !== 'about:blank'
        && (url.includes('.form') || url.includes('FORMACAO_COMPL') || url.includes('formacao_compl'))) {
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

/** Preenche o curso via lupa curso() — igual ao fluxo de formação */
async function fillCursoViaLupa(page: Page, formFrame: Frame, cursoName: string): Promise<boolean> {
  console.log('   🎓 Abrindo lupa de curso (curso())...');
  await formFrame.evaluate(() => { (window as any).curso(); });
  await page.waitForTimeout(4000);

  // Encontrar frame do curso (pode ser prc_curso_form ou prc_curso_outro)
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cursoFrame = f; break; }
  }
  if (!cursoFrame) {
    console.log('   ⚠️  Modal curso não abriu — tentando preenchimento direto');
    return fillFast(formFrame, 'f_curso', cursoName);
  }
  console.log(`   ✅ Modal curso: ${cursoFrame.url()}`);

  // Verificar select
  const opts = await cursoFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
    if (!sel) return null;
    return Array.from(sel.options).map(o => ({ value: o.value.trim(), text: (o.textContent || '').trim() }))
      .filter(o => o.value && o.text.length > 3);
  });

  // Se curso existe no select, selecionar e fechar
  if (opts && opts.length > 0) {
    const match = opts.find(o => o.text.toLowerCase().includes(cursoName.toLowerCase()));
    if (match) {
      console.log(`   ✅ Curso no select: "${match.text}"`);
      await cursoFrame.selectOption('select[name="f_curso"]', match.value);
      await page.waitForTimeout(1000);
      await cursoFrame.evaluate(() => { (window as any).voltar?.(); }).catch(() => {});
      await page.waitForTimeout(2000);
      return true;
    }
  }

  // Cadastrar novo curso (novocurso)
  console.log('   🆕 Cadastrando novo curso...');
  await cursoFrame.evaluate(() => { (window as any).novocurso?.(); });
  await page.waitForTimeout(3000);

  // Preencher nome ANTES da área
  await fillFast(cursoFrame, 'f_dsc_curso', cursoName);
  console.log('   ✅ Nome preenchido');

  // Área: expandir Ciências Sociais Aplicadas → Desenho Industrial
  console.log('   📂 Selecionando área...');
  await cursoFrame.evaluate(() => { (window as any).area?.(); });
  await page.waitForTimeout(4000);

  let areaFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_area_curso')) { areaFrame = f; break; }
  }
  if (areaFrame) {
    await areaFrame.evaluate(() => {
      const link = document.querySelector('a[href*="F_GR=60000007"]') as HTMLElement;
      if (link) link.click();
    });
    await page.waitForTimeout(4000);
    await areaFrame.evaluate(() => {
      const links = document.querySelectorAll('a[onclick*="check("]');
      for (const link of links) {
        const text = (link.textContent || '').trim();
        if (text.toLowerCase().includes('desenho industrial')) {
          (link as HTMLElement).click();
          return;
        }
      }
    });
    await page.waitForTimeout(3000);
    console.log('   ✅ Área selecionada');
  }

  // Confirmar curso
  await cursoFrame.evaluate(() => { (window as any).check?.(); });
  await page.waitForTimeout(3000);

  // Voltar ao select e selecionar o curso novo
  let novoOpts: Array<{ value: string; text: string }> = [];
  let cursoFrame2: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) {
      cursoFrame2 = f;
      const state = await f.evaluate(() => {
        const sel = document.querySelector('select[name="f_curso"]') as HTMLSelectElement | null;
        if (!sel) return { hasSelect: false, opts: [] };
        return {
          hasSelect: true,
          opts: Array.from(sel.options).map(o => ({ value: o.value.trim(), text: (o.textContent || '').trim() })),
        };
      }).catch(() => ({ hasSelect: false, opts: [] }));
      if (state.hasSelect) { novoOpts = state.opts; }
      break;
    }
  }

  const novo = novoOpts.find(o => o.text.toLowerCase().includes(cursoName.toLowerCase()));
  if (novo && cursoFrame2) {
    console.log(`   ✅ Curso criado: "${novo.text}"`);
    await cursoFrame2.selectOption('select[name="f_curso"]', novo.value);
    await page.waitForTimeout(1000);
    await cursoFrame2.evaluate(() => { (window as any).voltar?.(); }).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  }

  // Fallback: preencher direto
  console.log('   ⚠️  Curso não confirmado via modal — direto');
  return fillFast(formFrame, 'f_curso', cursoName);
}

async function main() {
  console.log(`🎓 WebEDSI v2 @ UFPR — Formação complementar\n`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação complementar');
  await page.waitForTimeout(5000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao_compl')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }

  await nav.clickNewRecord(listFrame);
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  // 1. Nível
  await formFrame.selectOption('select[name="f_nivel"]', ENTRY.nivel).catch(async () => {
    await formFrame.evaluate((val: string) => {
      const sel = document.querySelector('select[name="f_nivel"]') as HTMLSelectElement;
      if (sel) { sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }, ENTRY.nivel);
  });
  console.log(`✅ Nível: F`);

  // 2. Instituição
  await nav.fillLupa('f_inst', ENTRY.instituicao, formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`🏫 f_inst = "${instVal}"`);

  // 3. Curso via lupa
  await fillCursoViaLupa(page, formFrame, ENTRY.nome);
  const cursoVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
  console.log(`🎓 f_curso = "${cursoVal}"`);

  // 4. Carga
  await fillFast(formFrame, 'f_carga', ENTRY.cargaHoraria);
  console.log(`✅ Carga: ${ENTRY.cargaHoraria}h`);

  // 5. Status
  const statusRadio = await formFrame.$('input[name="F_STATUS"][value="S"]');
  if (statusRadio) {
    await statusRadio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    console.log('✅ Status: Concluído');
  }

  // 6. Avançar
  console.log('\n📄 Avançando...');
  await formFrame.evaluate(() => {
    const links = document.querySelectorAll('a, button, input[type="button"]');
    for (const el of links) {
      const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
      if (text.includes('Avançar')) { (el as HTMLElement).click(); return; }
    }
    (window as any).check?.();
  });
  await page.waitForTimeout(4000);

  // 7. Verificar se há campos de data (pág 2)
  const afterMap = await formFrame.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      name: (el as HTMLInputElement).name || '',
      type: (el as HTMLInputElement).type || 'select',
      value: ((el as HTMLInputElement).value || '').substring(0, 40),
      visible: !!(el as HTMLElement).offsetParent,
    }));
  });
  console.log('\n📋 Campos visíveis após Avançar:');
  for (const f of afterMap) {
    if (f.visible) console.log(`   name="${f.name}" type="${f.type}" value="${f.value}"`);
  }

  // Preencher datas se existirem
  for (const [name, value, label] of [
    ['f_mes_ini', '05', 'Mês início'],
    ['f_ano_ini', '2026', 'Ano início'],
    ['f_mes_fim', '05', 'Mês fim'],
    ['f_ano_fim', '2026', 'Ano fim'],
  ] as const) {
    const ok = await fillFast(formFrame, name, value);
    if (ok) console.log(`   ✅ ${label} = ${value}`);
  }

  // 8. Salvar
  await nav.takeSnapshot('webedsi2_pre_save');
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

  if (!saveResult.success) {
    const bodyText = await formFrame.textContent('body').catch(() => '') || '';
    console.log(`   Erro msg: ${bodyText.match(/Campo\s+[^<]{0,80}obrigatório[^<]{0,80}/g)?.join(' | ') || 'n/a'}`);
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }

  await nav.takeSnapshot('webedsi2_post_save');
  await nav.closeModal();
  await page.waitForTimeout(2000);

  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`\n📋 Registros: ${listState.data.records.length}`);
    for (const r of listState.data.records) console.log(`   • ${r.text.substring(0, 120)}`);
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
