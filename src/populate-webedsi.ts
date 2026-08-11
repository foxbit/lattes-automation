/**
 * Adiciona WebEDSI na Formação complementar — fluxo completo com UFPR
 * Uso: npx tsx src/populate-webedsi.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const ENTRY = {
  nome: '5º Webinário de Estudos em Design de Sistemas de Informação (WebEDSI)',
  instituicao: 'Universidade Federal do Paraná',
  nivel: 'F',
  cargaHoraria: '8',
  mesInicio: '05', anoInicio: '2026',
  mesFim: '05', anoFim: '2026',
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

async function main() {
  console.log(`🎓 WebEDSI @ UFPR — Formação complementar\n`);

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

  // 2. Instituição UFPR
  await nav.fillLupa('f_inst', ENTRY.instituicao, formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`🏫 f_inst = "${instVal}"`);
  if (!instVal) { console.log('   ❌ Instituição vazia'); await session.close(); return; }

  // 3. Curso — no complementar o curso NÃO tem lupa própria visível (só sele_inst).
  //    Preencher direto (disabled) e verificar se o check() do Avançar aceita.
  await fillFast(formFrame, 'f_curso', ENTRY.nome);
  const cursoVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
  console.log(`🎓 f_curso = "${cursoVal}"`);

  // 4. Carga horária
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

  // 6. Avançar — verificar se a pág 2 aparece
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

  // Mapear campos visíveis APÓS avançar
  const afterMap = await formFrame.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      name: (el as HTMLInputElement).name || '',
      type: (el as HTMLInputElement).type || 'select',
      value: ((el as HTMLInputElement).value || '').substring(0, 40),
      visible: !!(el as HTMLElement).offsetParent,
      disabled: (el as HTMLInputElement).disabled,
    }));
  });
  console.log('\n📋 Campos após Avançar:');
  for (const f of afterMap) {
    console.log(`   name="${f.name}" type="${f.type}" value="${f.value}" vis=${f.visible} dis=${f.disabled}`);
  }

  // 7. Datas (se visíveis)
  let dataOk = false;
  for (const [name, value, label] of [
    ['f_mes_ini', ENTRY.mesInicio, 'Mês início'],
    ['f_ano_ini', ENTRY.anoInicio, 'Ano início'],
    ['f_mes_fim', ENTRY.mesFim, 'Mês fim'],
    ['f_ano_fim', ENTRY.anoFim, 'Ano fim'],
  ] as const) {
    const ok = await fillFast(formFrame, name, value);
    if (ok) dataOk = true;
    console.log(`   ${ok ? '✅' : '⚠️'} ${label} = ${value}`);
  }

  // Se datas não existem, verificar se form já tem campos próprios
  if (!dataOk) {
    // Talvez datas estejam em outra página via "Avançar" de novo, ou em selects
    const monthSelect = await formFrame.$('select[name*="mes" i]');
    if (monthSelect) {
      try {
        await monthSelect.selectOption(ENTRY.mesInicio);
        console.log('   ✅ Mês início (select)');
      } catch { /* ignore */ }
    }
  }

  // 8. Screenshot + Salvar
  await nav.takeSnapshot('webedsi_pre_save');
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

  if (!saveResult.success) {
    // Verificar botão Salvar manualmente
    const saveBtn = await formFrame.$('a[onclick*="check"], a:has-text("Salvar"), input[value="Salvar"]');
    console.log(`   Botão Salvar encontrado: ${saveBtn ? 'sim' : 'não'}`);
    if (saveBtn) {
      await saveBtn.evaluate((el: HTMLElement) => el.click()).catch(() => {});
      await page.waitForTimeout(3000);
      console.log('   ⚠️ Clique manual no Salvar');
    }
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }

  await nav.takeSnapshot('webedsi_post_save');
  await nav.closeModal();
  await page.waitForTimeout(2000);

  // Verificar lista
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`\n📋 Registros: ${listState.data.records.length}`);
    for (const r of listState.data.records) console.log(`   • ${r.text.substring(0, 120)}`);
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
