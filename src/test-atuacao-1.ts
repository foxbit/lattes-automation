/**
 * ITERAÇÃO 2: Teste de save de 1 registro de atuação profissional
 * 
 * Fluxo: navegar → abrir form → lupa instituição (novo mecanismo) →
 * f_stavinc → f_vinc (dominio) → enquadramento → período → salvar → verificar
 * 
 * Uso: npx tsx src/test-atuacao-1.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const VINC = {
  instituicao: 'SENAC',
  tipoVinculo: 'Emprego privado', // f_stavinc select
  vinculo: 'Celetista',            // f_vinc dominio
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

async function main() {
  console.log('🧪 ITERAÇÃO 2: Teste 1 registro atuação\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // 1. Navegar
  console.log('📂 Navegando...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // 2. Abrir novo
  console.log('🆕 Abrindo novo registro...');
  const clickResult = await nav.clickNewRecord();
  if (!clickResult.success) {
    console.log(`❌ ${clickResult.error}`);
    await session.close();
    return;
  }
  
  const formFrame = await findFormFrame(page);
  if (!formFrame) {
    console.log('❌ Form frame não encontrado');
    await session.close();
    return;
  }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // 3. Lupa instituição (novo mecanismo)
  console.log(`\n🏫 Instituição: ${VINC.instituicao}`);
  const lupaResult = await nav.fillLupa('f_inst', VINC.instituicao, formFrame);
  console.log(`   Resultado lupa: ${lupaResult.success ? '✅' : '❌ ' + lupaResult.error}`);
  
  // Verificar se foi preenchido
  const instVal = await formFrame.evaluate(() => {
    const input = document.querySelector('input[name="f_inst"]') as HTMLInputElement | null;
    const cod = document.querySelector('input[name="f_cod_inst"]') as HTMLInputElement | null;
    return { inst: input?.value || null, cod: cod?.value || null };
  });
  console.log(`   Campo f_inst: "${instVal.inst}" (cod: ${instVal.cod})`);
  
  if (!instVal.inst) {
    console.log('   ⚠️  Instituição NÃO preenchida - abortando');
    await session.close();
    return;
  }
  
  // 4. f_stavinc (select tipo vínculo)
  console.log(`\n📋 Tipo vínculo (f_stavinc): ${VINC.tipoVinculo}`);
  try {
    await formFrame.selectOption('select[name="f_stavinc"]', { label: VINC.tipoVinculo });
    console.log('   ✅ f_stavinc selecionado');
  } catch (e) {
    console.log(`   ⚠️  select falhou: ${(e as Error).message}`);
    // Try by value
    try {
      await formFrame.selectOption('select[name="f_stavinc"]', VINC.tipoVinculo);
      console.log('   ✅ f_stavinc por value');
    } catch (e2) {
      console.log(`   ❌ f_stavinc: ${(e2 as Error).message}`);
    }
  }
  
  // 5. f_vinc (dominio) - usa opções fixas
  console.log(`\n🔗 Vínculo (f_vinc): ${VINC.vinculo}`);
  const vincLupa = await nav.fillLupa('f_vinc', VINC.vinculo, formFrame);
  console.log(`   Resultado: ${vincLupa.success ? '✅' : '❌ ' + vincLupa.error}`);
  
  // 6. Outros campos
  console.log('\n📝 Preenchendo campos restantes...');
  const fields: [string, string][] = [
    ['f_enqua', VINC.enquadramento],
    ['f_carga', VINC.cargaHoraria],
    ['f_mes_ini', VINC.mesInicio],
    ['f_ano_ini', VINC.anoInicio],
  ];
  
  for (const [name, value] of fields) {
    const r = await nav.fillField(name, value, formFrame);
    console.log(`   ${r.success ? '✅' : '❌'} ${name} = ${value}`);
  }
  
  // 7. Status (radio)
  console.log(`\n📅 Status: ${VINC.statusAtual ? 'Atual' : 'Anterior'}`);
  const radioVal = VINC.statusAtual ? 'S' : 'N';
  const radio = await formFrame.$(`input[name="f_status"][value="${radioVal}"]`);
  if (radio) {
    await radio.check();
    console.log(`   ✅ f_status = ${radioVal}`);
  } else {
    console.log('   ❌ radio não encontrado');
  }
  
  if (!VINC.statusAtual) {
    await page.waitForTimeout(500);
    await nav.fillField('f_mes_fim', VINC.mesFim, formFrame);
    await nav.fillField('f_ano_fim', VINC.anoFim, formFrame);
    console.log(`   ✅ Período fim: ${VINC.mesFim}/${VINC.anoFim}`);
  }
  
  // 8. Descrição
  await nav.fillField('f_outras_inf', VINC.descricao, formFrame);
  console.log('   ✅ Descrição');
  
  // 9. Screenshot antes do save
  await nav.takeSnapshot('it2_pre_save');
  
  // 10. Salvar
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   Resultado: ${saveResult.success ? '✅ SALVO' : '❌ ' + saveResult.error}`);
  
  // 11. Verificar se apareceu diálogo de erro e capturar texto
  const bodyText = await formFrame.textContent('body').catch(() => '') || '';
  if (bodyText.includes('Não foi possível') || bodyText.includes('obrigatório não informado')) {
    console.log('\n⚠️  Diálogo de erro detectado:');
    // Extract error messages
    const errMatch = bodyText.match(/Campo\s+[^<]{0,80}obrigatório[^<]{0,80}/g);
    if (errMatch) {
      for (const e of errMatch) console.log(`   - ${e.trim()}`);
    }
    // Fechar diálogo
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }
  
  await nav.takeSnapshot('it2_post_save');
  
  // 12. Fechar modal e verificar lista
  await nav.closeModal();
  await page.waitForTimeout(2000);
  
  console.log('\n📋 Verificando lista de atuação...');
  const listResult = await nav.readModuleList();
  if (listResult.success) {
    const records = listResult.data?.records || [];
    console.log(`   Registros na lista: ${records.length}`);
    for (const rec of records) {
      console.log(`   • ${rec.text}`);
    }
  }
  
  await session.close();
  console.log('\n✅ Iteração 2 concluída');
}

main().catch(console.error);
