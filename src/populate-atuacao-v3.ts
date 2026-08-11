/**
 * Popula atuação profissional no Lattes - v3 com navegação por abas
 * Uso: npx tsx src/populate-atuacao-v3.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Vinculo {
  instituicao: string;
  tipoVinculo: string;  // Emprego privado, Sócio/Administrador, Autônomo
  vinculo: string;       // CLT, PJ, etc.
  enquadramento: string;
  cargaHoraria: string;
  mesInicio: string;
  anoInicio: string;
  mesFim?: string;
  anoFim?: string;
  statusAtual: boolean;
  descricao: string;
}

const VINCULOS: Vinculo[] = [
  {
    instituicao: 'SENAC',
    tipoVinculo: 'Emprego privado',
    vinculo: 'CLT',
    enquadramento: 'Professor de Editoração Eletrônica',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2008',
    mesFim: '12', anoFim: '2011',
    statusAtual: false,
    descricao: 'Ministrou disciplinas de editoração eletrônica, abordando ferramentas de design gráfico, diagramação e produção de material digital.',
  },
  {
    instituicao: 'Pipa',
    tipoVinculo: 'Sócio/Administrador',
    vinculo: 'Sócio',
    enquadramento: 'Diretor de Arte',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2012',
    mesFim: '12', anoFim: '2015',
    statusAtual: false,
    descricao: 'Fundou e atuou como Diretor de Arte da Agência Pipa, agência pioneira de publicidade digital no Maranhão.',
  },
  {
    instituicao: 'RocketArts',
    tipoVinculo: 'Sócio/Administrador',
    vinculo: 'Sócio',
    enquadramento: 'Product Designer Leader',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2019',
    mesFim: '12', anoFim: '2021',
    statusAtual: false,
    descricao: 'Fundou a RocketArts, startup digital de conteúdo por assinatura para setores profissionais.',
  },
  {
    instituicao: 'Platform Builders',
    tipoVinculo: 'Emprego privado',
    vinculo: 'PJ',
    enquadramento: 'Lead Product Designer',
    cargaHoraria: '40',
    mesInicio: '05', anoInicio: '2020',
    mesFim: '10', anoFim: '2023',
    statusAtual: false,
    descricao: 'Lead Product Designer conduzindo projetos para Carrefour Brasil e Grupo DPSP.',
  },
  {
    instituicao: 'Builders Venture Studio',
    tipoVinculo: 'Emprego privado',
    vinculo: 'PJ',
    enquadramento: 'UX Design Lead',
    cargaHoraria: '40',
    mesInicio: '10', anoInicio: '2023',
    mesFim: '02', anoFim: '2025',
    statusAtual: false,
    descricao: 'Prototipagem e condução de experimentos para validar ideias e produtos.',
  },
  {
    instituicao: 'Leany',
    tipoVinculo: 'Emprego privado',
    vinculo: 'PJ',
    enquadramento: 'Lead Product Design',
    cargaHoraria: '40',
    mesInicio: '03', anoInicio: '2025',
    statusAtual: true,
    descricao: 'Lidera estratégia de design e UX, desenvolvendo soluções com No-Code, AI-Code e Automação.',
  },
];

async function findFormFrame(page: Page): Promise<Frame | null> {
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes('PKG_ATIV.inclui') || f.url().includes('pkg_ativ.form')) return f;
    }
  }
  return null;
}

async function clickSidebarTab(frame: Frame, tabName: string): Promise<boolean> {
  // The sidebar tabs are <a> or <td> elements with text like "Instituição", "Vínculo", etc.
  const selectors = [
    `a:has-text("${tabName}")`,
    `td:has-text("${tabName}")`,
    `span:has-text("${tabName}")`,
    `div:has-text("${tabName}")`,
  ];
  
  for (const sel of selectors) {
    try {
      const el = await frame.$(sel);
      if (el) {
        await el.click();
        await new Promise(r => setTimeout(r, 1000));
        return true;
      }
    } catch {}
  }
  
  // Try by evaluating onclick
  try {
    const clicked = await frame.evaluate((name: string) => {
      const els = document.querySelectorAll('a, td, span, div');
      for (const el of els) {
        if (el.textContent?.trim() === name) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, tabName);
    if (clicked) {
      await new Promise(r => setTimeout(r, 1000));
      return true;
    }
  } catch {}
  
  return false;
}

async function fillFieldDirect(frame: Frame, name: string, value: string): Promise<boolean> {
  try {
    const el = await frame.$(`input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`);
    if (!el) return false;
    const disabled = await el.getAttribute('disabled');
    if (disabled !== null) {
      await el.evaluate((e: HTMLInputElement) => e.removeAttribute('disabled'));
    }
    await el.fill(value);
    return true;
  } catch { return false; }
}

async function selectOption(frame: Frame, name: string, value: string): Promise<boolean> {
  try {
    await frame.selectOption(`select[name="${name}"]`, value);
    return true;
  } catch { return false; }
}

async function main() {
  console.log('📝 Populando atuação profissional v3 (com abas)\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  console.log('📂 Navegando...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  let success = 0;
  let failed = 0;
  
  for (const vinc of VINCULOS) {
    console.log(`\n📌 ${vinc.instituicao} — ${vinc.enquadramento}`);
    
    // Click "Incluir novo item"
    const clickResult = await nav.clickNewRecord();
    if (!clickResult.success) {
      console.log(`   ❌ ${clickResult.error}`);
      failed++;
      continue;
    }
    
    const formFrame = await findFormFrame(page);
    if (!formFrame) {
      console.log('   ❌ Frame não encontrado');
      failed++;
      continue;
    }
    
    console.log(`   Frame: ${formFrame.url()}`);
    
    try {
      // ── ABA INSTITUIÇÃO ──
      console.log('   📋 Aba Instituição...');
      await clickSidebarTab(formFrame, 'Instituição');
      
      // Fill institution via lupa
      const lupaResult = await nav.fillLupa('f_inst', vinc.instituicao, formFrame);
      if (lupaResult.success) {
        console.log(`   ✅ Instituição = ${vinc.instituicao}`);
      } else {
        console.log(`   ⚠️  Lupa falhou: ${lupaResult.error}`);
        // Try direct fill
        await fillFieldDirect(formFrame, 'f_inst', vinc.instituicao);
        console.log(`   ✅ Instituição (direto) = ${vinc.instituicao}`);
      }
      
      // ── ABA VÍNCULO ──
      console.log('   📋 Aba Vínculo...');
      await clickSidebarTab(formFrame, 'Vínculo');
      await page.waitForTimeout(1000);
      
      // Read fields in this tab
      const vincFields = await nav.readFormFields(formFrame);
      console.log(`   Campos na aba Vínculo: ${vincFields.length}`);
      for (const f of vincFields) {
        console.log(`     ${f.label || f.name || f.id} (${f.type}) = ${f.value || '(vazio)'}`);
      }
      
      // Fill tipo vínculo
      const tipoResult = await fillFieldDirect(formFrame, 'f_tipo_vinc', vinc.tipoVinculo);
      if (tipoResult) {
        console.log(`   ✅ Tipo vínculo = ${vinc.tipoVinculo}`);
      } else {
        // Try select
        const tipoSelect = await selectOption(formFrame, 'f_tipo_vinc', vinc.tipoVinculo);
        if (tipoSelect) console.log(`   ✅ Tipo vínculo (select) = ${vinc.tipoVinculo}`);
        else console.log('   ⚠️  Tipo vínculo não encontrado');
      }
      
      // Fill vínculo
      const vincResult = await nav.fillLupa('f_vinc', vinc.vinculo, formFrame);
      if (vincResult.success) {
        console.log(`   ✅ Vínculo = ${vinc.vinculo}`);
      } else {
        await fillFieldDirect(formFrame, 'f_vinc', vinc.vinculo);
        console.log(`   ✅ Vínculo (direto) = ${vinc.vinculo}`);
      }
      
      // Fill enquadramento
      await fillFieldDirect(formFrame, 'f_enqua', vinc.enquadramento);
      console.log(`   ✅ Enquadramento = ${vinc.enquadramento}`);
      
      // Fill carga horária
      await fillFieldDirect(formFrame, 'f_carga', vinc.cargaHoraria);
      console.log(`   ✅ Carga horária = ${vinc.cargaHoraria}`);
      
      // ── ABA PERÍODO ──
      console.log('   📋 Aba Período...');
      await clickSidebarTab(formFrame, 'Período');
      await page.waitForTimeout(1000);
      
      await fillFieldDirect(formFrame, 'f_mes_ini', vinc.mesInicio);
      await fillFieldDirect(formFrame, 'f_ano_ini', vinc.anoInicio);
      
      if (vinc.statusAtual) {
        const radio = await formFrame.$('input[name="f_status"][value="S"]');
        if (radio) await radio.check();
        console.log('   ✅ Status = Atual');
      } else {
        const radio = await formFrame.$('input[name="f_status"][value="N"]');
        if (radio) await radio.check();
        await page.waitForTimeout(500);
        await fillFieldDirect(formFrame, 'f_mes_fim', vinc.mesFim!);
        await fillFieldDirect(formFrame, 'f_ano_fim', vinc.anoFim!);
        console.log(`   ✅ Status = Não atual (${vinc.mesFim}/${vinc.anoFim})`);
      }
      
      // ── ABA OUTRAS INFORMAÇÕES ──
      console.log('   📋 Aba Outras informações...');
      await clickSidebarTab(formFrame, 'Outras informac');
      await page.waitForTimeout(1000);
      
      await fillFieldDirect(formFrame, 'f_outras_inf', vinc.descricao);
      console.log('   ✅ Descrição preenchida');
      
      // ── SALVAR ──
      console.log('   💾 Salvando...');
      
      // Remove overlays
      await page.evaluate(() => {
        document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
      }).catch(() => {});
      await formFrame.evaluate(() => {
        document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
      }).catch(() => {});
      
      // Find save button in the form frame
      const saveBtn = await formFrame.$('input[value="Salvar"], a:has-text("Salvar"), button:has-text("Salvar")');
      if (saveBtn) {
        await saveBtn.click({ force: true });
        await page.waitForTimeout(3000);
        
        // Check for error dialog
        const bodyText = await formFrame.textContent('body').catch(() => '') || '';
        if (bodyText.includes('Não foi possível') || bodyText.includes('Campo') && bodyText.includes('obrigatório')) {
          console.log('   ❌ Erro de validação detectado');
          // Close error dialog
          const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
          if (confirmBtn) await confirmBtn.click();
          failed++;
        } else {
          console.log('   ✅ SALVO!');
          success++;
        }
      } else {
        console.log('   ❌ Botão Salvar não encontrado');
        failed++;
      }
      
    } catch (e) {
      console.log(`   ❌ Erro: ${(e as Error).message}`);
      failed++;
    }
    
    // Close modal
    await nav.closeModal();
    await page.waitForTimeout(2000);
  }
  
  console.log(`\n📊 Resultado: ${success} sucesso, ${failed} falhas`);
  await nav.takeSnapshot('populate_atuacao_v3');
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
