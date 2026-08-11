/**
 * ITERAÇÃO 3: Teste com navegação entre abas do form de atuação
 * 
 * Form de atuação tem abas: Instituição | Vínculo | Período | Outras informações | Visibilidade
 * 
 * Uso: npx tsx src/test-atuacao-2.ts
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

/** Clica numa aba lateral do form por texto */
async function clickTab(page: Page, frame: Frame, tabText: string): Promise<boolean> {
  // Tabs are likely <a> or <div> elements in a sidebar
  const clicked = await frame.evaluate((text: string) => {
    const els = document.querySelectorAll('a, td, span, div, li, button');
    for (const el of els) {
      const t = (el.textContent || '').trim();
      if (t === text || t.startsWith(text)) {
        // Only click if it looks like a tab (has onclick or is in a nav container)
        const oc = el.getAttribute('onclick');
        const parent = el.parentElement;
        const parentClass = parent ? parent.className : '';
        if (oc || parentClass.includes('menu') || parentClass.includes('tab') || parentClass.includes('nav') || parentClass.includes('item') || el.tagName === 'A') {
          (el as HTMLElement).click();
          return { clicked: true, tag: el.tagName, text: t, onclick: oc, parentClass };
        }
      }
    }
    return { clicked: false };
  }, tabText);

  if (clicked.clicked) {
    console.log(`   📌 Aba "${tabText}" clicada (${clicked.tag}, parent=${clicked.parentClass})`);
    await page.waitForTimeout(1500);
    return true;
  }
  console.log(`   ⚠️  Aba "${tabText}" não encontrada diretamente`);
  return false;
}

async function main() {
  console.log('🧪 ITERAÇÃO 3: navegação por abas + save\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // 1. Navegar
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // 2. Abrir novo
  await nav.clickNewRecord();
  const formFrame = await findFormFrame(page);
  if (!formFrame) {
    console.log('❌ Form frame não encontrado');
    await session.close();
    return;
  }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // 3. Listar TODOS os elementos clicáveis (tabs e campos) para mapear o form
  console.log('\n🔍 Mapeando elementos do form...');
  const formMap = await formFrame.evaluate(() => {
    // All clickable elements with text
    const clickables = Array.from(document.querySelectorAll('a, input[type="button"], button, td, div[onclick]')).map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().substring(0, 50),
      onclick: el.getAttribute('onclick')?.substring(0, 80),
      className: el.className?.substring(0, 60),
      id: el.id,
    })).filter(x => x.text || x.onclick);
    
    // All inputs
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      tag: el.tagName,
      name: (el as HTMLInputElement).name,
      type: (el as HTMLInputElement).type || 'select',
      value: ((el as HTMLInputElement).value || '').substring(0, 40),
      visible: !!(el as HTMLElement).offsetParent,
      readonly: (el as HTMLInputElement).readOnly,
      disabled: (el as HTMLInputElement).disabled,
    }));
    
    return { clickables: clickables.slice(0, 40), inputs };
  });
  
  console.log('\n📋 Elementos clicáveis:');
  for (const c of formMap.clickables) {
    console.log(`   <${c.tag}> "${c.text}" onclick="${c.onclick || ''}" class="${c.className}"`);
  }
  
  console.log('\n📋 Inputs:');
  for (const i of formMap.inputs) {
    console.log(`   <${i.tag}> name="${i.name}" type="${i.type}" value="${i.value}" visible=${i.visible} readonly=${i.readonly}`);
  }
  
  // 4. Aba Instituição: preencher lupa
  console.log('\n🏫 Aba Instituição — preenchendo lupa SENAC...');
  const lupaResult = await nav.fillLupa('f_inst', VINC.instituicao, formFrame);
  console.log(`   Lupa: ${lupaResult.success ? '✅' : '❌ ' + lupaResult.error}`);
  
  // Verificar
  const instVal = await formFrame.evaluate(() => {
    const input = document.querySelector('input[name="f_inst"]') as HTMLInputElement | null;
    return input?.value || null;
  });
  console.log(`   f_inst = "${instVal}"`);
  
  // 5. Navegar para aba Vínculo
  console.log('\n🔗 Aba Vínculo...');
  await clickTab(page, formFrame, 'Vínculo');
  
  // Verificar o que ficou visível agora
  const vincTabState = await formFrame.evaluate(() => {
    const visibleInputs = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(el => !!(el as HTMLElement).offsetParent)
      .map(el => ({
        name: (el as HTMLInputElement).name,
        type: (el as HTMLInputElement).type || 'select',
        value: ((el as HTMLInputElement).value || '').substring(0, 40),
        readonly: (el as HTMLInputElement).readOnly,
      }));
    return visibleInputs;
  });
  console.log('   Inputs visíveis na aba Vínculo:');
  for (const i of vincTabState) {
    console.log(`     name="${i.name}" type="${i.type}" value="${i.value}" readonly=${i.readonly}`);
  }
  
  // Preencher f_stavinc se visível
  const stavincVisible = await formFrame.$('select[name="f_stavinc"]:visible, select[name="f_stavinc"]');
  if (stavincVisible) {
    try {
      const opts = await stavincVisible.evaluate((el) => {
        const sel = el as HTMLSelectElement;
        return Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent?.trim() }));
      });
      console.log('   Opções f_stavinc:', JSON.stringify(opts));
      
      // Select "Emprego privado" if exists
      await stavincVisible.selectOption({ label: 'Emprego privado' }).catch(async () => {
        await stavincVisible.selectOption({ label: 'Celetista' }).catch(() => {});
      });
      console.log('   ✅ f_stavinc selecionado');
    } catch (e) {
      console.log(`   ⚠️  f_stavinc: ${(e as Error).message}`);
    }
  }
  
  // Preencher f_vinc via dominio
  console.log('\n🔗 Preenchendo f_vinc (dominio)...');
  const vincResult = await nav.fillLupa('f_vinc', VINC.vinculo, formFrame);
  console.log(`   Vínculo: ${vincResult.success ? '✅' : '❌ ' + vincResult.error}`);
  
  // Verificar se f_stavinc foi preenchido automaticamente
  const stavincAfter = await formFrame.evaluate(() => {
    const sel = document.querySelector('select[name="f_stavinc"]') as HTMLSelectElement | null;
    return sel ? sel.value : null;
  });
  console.log(`   f_stavinc após f_vinc: "${stavincAfter}"`);
  
  // Preencher f_enqua
  const enqua = await nav.fillField('f_enqua', VINC.enquadramento, formFrame);
  console.log(`   f_enqua: ${enqua.success ? '✅' : '❌ ' + enqua.error}`);
  
  // Carga horária
  const carga = await nav.fillField('f_carga', VINC.cargaHoraria, formFrame);
  console.log(`   f_carga: ${carga.success ? '✅' : '❌ ' + carga.error}`);
  
  // 6. Navegar para aba Período
  console.log('\n📅 Aba Período...');
  await clickTab(page, formFrame, 'Período');
  
  const mesIni = await nav.fillField('f_mes_ini', VINC.mesInicio, formFrame);
  console.log(`   f_mes_ini: ${mesIni.success ? '✅' : '❌ ' + mesIni.error}`);
  const anoIni = await nav.fillField('f_ano_ini', VINC.anoInicio, formFrame);
  console.log(`   f_ano_ini: ${anoIni.success ? '✅' : '❌ ' + anoIni.error}`);
  
  // Status radio
  const radio = await formFrame.$('input[name="f_status"][value="N"]');
  if (radio) {
    await radio.check().catch(() => {});
    console.log('   ✅ f_status = N');
    await page.waitForTimeout(500);
    await nav.fillField('f_mes_fim', VINC.mesFim, formFrame);
    await nav.fillField('f_ano_fim', VINC.anoFim, formFrame);
    console.log(`   ✅ Período fim: ${VINC.mesFim}/${VINC.anoFim}`);
  }
  
  // 7. Aba Outras informações
  console.log('\n📝 Aba Outras informações...');
  await clickTab(page, formFrame, 'Outras informac');
  const desc = await nav.fillField('f_outras_inf', VINC.descricao, formFrame);
  console.log(`   f_outras_inf: ${desc.success ? '✅' : '❌ ' + desc.error}`);
  
  // 8. Salvar
  console.log('\n💾 Salvando...');
  await nav.takeSnapshot('it3_pre_save');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   Resultado: ${saveResult.success ? '✅ SALVO' : '❌ ' + saveResult.error}`);
  
  // Verificar diálogo de erro
  const bodyText = await formFrame.textContent('body').catch(() => '') || '';
  if (bodyText.includes('Não foi possível') || bodyText.includes('obrigatório não informado')) {
    console.log('⚠️  Erros de validação:');
    const errMatch = bodyText.match(/Campo\s+[^<]{0,80}obrigatório[^<]{0,80}/g);
    if (errMatch) for (const e of errMatch) console.log(`   - ${e.trim()}`);
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }
  
  await nav.takeSnapshot('it3_post_save');
  
  // 9. Fechar e verificar
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
  console.log('\n✅ Iteração 3 concluída');
}

main().catch(console.error);
