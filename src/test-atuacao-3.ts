/**
 * ITERAÇÃO 4: Preencher form de atuação SEM navegar por abas
 * 
 * Lição Iteração 3: TODOS os campos visíveis desde o início.
 * Não clicar nas abas (onclick vazio quebra o form).
 * 
 * Uso: npx tsx src/test-atuacao-3.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const VINC = {
  instituicao: 'SENAC',
  vinculo: 'Celetista',
  enquadramento: 'Professor de Editoração Eletrônica',
  cargaHoraria: '40',
  mesInicio: '01', anoInicio: '2008',
  mesFim: '12', anoFim: '2011',
  statusAtual: false,
  descricao: 'Ministrou disciplinas de editoração eletrônica, abordando ferramentas de design gráfico, diagramação e produção de material digital.',
};

async function findFormFrame(page: Page): Promise<Frame | null> {
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes('PKG_ATIV.inclui') || f.url().includes('pkg_ativ.form')) return f;
    }
  }
  return null;
}

/** Fill com timeout curto e força via JS quando invisível */
async function fillFast(frame: Frame, name: string, value: string): Promise<boolean> {
  try {
    const el = await frame.$(`input[name="${name}"], textarea[name="${name}"]`);
    if (!el) return false;
    
    // Força preenchimento via JS (evita timeout de visibilidade)
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
  console.log('🧪 ITERAÇÃO 4: preencher direto sem abas\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navegar
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // Abrir novo
  await nav.clickNewRecord();
  const formFrame = await findFormFrame(page);
  if (!formFrame) {
    console.log('❌ Form frame não encontrado');
    await session.close();
    return;
  }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // 1. Lupa instituição
  console.log(`\n🏫 Instituição (lupa): ${VINC.instituicao}`);
  const lupaResult = await nav.fillLupa('f_inst', VINC.instituicao, formFrame);
  console.log(`   ${lupaResult.success ? '✅' : '❌ ' + lupaResult.error}`);
  
  const instVal = await formFrame.evaluate(() => 
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`   f_inst = "${instVal}"`);
  
  if (!instVal) {
    console.log('   ⚠️  Instituição vazia — abortando');
    await session.close();
    return;
  }
  
  // 2. Vínculo via dominio
  console.log(`\n🔗 Vínculo (dominio): ${VINC.vinculo}`);
  const vincResult = await nav.fillLupa('f_vinc', VINC.vinculo, formFrame);
  console.log(`   ${vincResult.success ? '✅' : '❌ ' + vincResult.error}`);
  
  // Verificar f_stavinc auto
  const stavinc = await formFrame.evaluate(() => 
    (document.querySelector('select[name="f_stavinc"]') as HTMLSelectElement)?.value || null);
  console.log(`   f_stavinc (auto) = "${stavinc}"`);
  
  // 3. Campos de texto (JS direct, sem esperar visibilidade)
  console.log('\n📝 Campos de texto:');
  const fields: [string, string][] = [
    ['f_enqua', VINC.enquadramento],
    ['f_carga', VINC.cargaHoraria],
    ['f_mes_ini', VINC.mesInicio],
    ['f_ano_ini', VINC.anoInicio],
    ['f_mes_fim', VINC.mesFim],
    ['f_ano_fim', VINC.anoFim],
  ];
  for (const [name, value] of fields) {
    const ok = await fillFast(formFrame, name, value);
    console.log(`   ${ok ? '✅' : '❌'} ${name} = ${value}`);
  }
  
  // 4. Radio status
  console.log('\n📅 Status radio:');
  const radio = await formFrame.$('input[name="f_status"][value="N"]');
  if (radio) {
    await radio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    console.log('   ✅ f_status = N (anterior)');
  } else {
    console.log('   ❌ radio não encontrado');
  }
  
  // 5. Descrição
  const descOk = await fillFast(formFrame, 'f_outras_inf', VINC.descricao);
  console.log(`\n📝 Descrição: ${descOk ? '✅' : '❌'}`);
  
  // 6. Screenshot antes
  await nav.takeSnapshot('it4_pre_save');
  
  // 7. Salvar
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   Resultado: ${saveResult.success ? '✅ SALVO' : '❌ ' + saveResult.error}`);
  
  // 8. Verificar erros
  const bodyText = await formFrame.textContent('body').catch(() => '') || '';
  if (bodyText.includes('Não foi possível') || bodyText.includes('obrigatório não informado')) {
    console.log('⚠️  Erros de validação:');
    const errMatch = bodyText.match(/Campo\s+[^<]{0,80}obrigatório[^<]{0,80}/g);
    if (errMatch) for (const e of errMatch) console.log(`   - ${e.trim()}`);
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }
  
  await nav.takeSnapshot('it4_post_save');
  
  // 9. Verificar lista
  await nav.closeModal();
  await page.waitForTimeout(2000);
  
  console.log('\n📋 Verificando lista...');
  const listResult = await nav.readModuleList();
  if (listResult.success) {
    const records = listResult.data?.records || [];
    console.log(`   Registros: ${records.length}`);
    for (const rec of records) console.log(`   • ${rec.text}`);
  }
  
  await session.close();
  console.log('\n✅ Iteração 4 concluída');
}

main().catch(console.error);
