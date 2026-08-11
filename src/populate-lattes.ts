/**
 * Script de automação para popular o Currículo Lattes
 * 
 * Dados do Angelo Rosa - baseado no documento de validação
 * Uso: npx tsx src/populate-lattes.ts [--dry-run] [--section <nome>]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import { getModuleById } from './registry/module-registry.js';
import type { Page, Frame } from 'playwright';

// ── Helpers ──────────────────────────────────────────────────

async function findFormFrame(page: Page, afterMs = 5000): Promise<Frame | null> {
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(afterMs / 8);
    for (const f of page.frames()) {
      const u = f.url();
      if (u.includes('.form') || u.includes('.inclui') || u.includes('prc_')) return f;
    }
  }
  return null;
}

async function findFormFrameAfterClick(page: Page): Promise<Frame | null> {
  return findFormFrame(page, 8000);
}

async function fillFieldBySelector(frame: Frame, selector: string, value: string): Promise<boolean> {
  try {
    const el = await frame.$(selector);
    if (!el) return false;
    const disabled = await el.getAttribute('disabled');
    if (disabled !== null) {
      await el.evaluate((e: HTMLElement) => e.removeAttribute('disabled'));
    }
    await el.fill('');
    await el.fill(value);
    return true;
  } catch { return false; }
}

async function fillFieldByLabel(frame: Frame, label: string, value: string): Promise<boolean> {
  try {
    // Try finding by label text
    const el = await frame.$(`input[name*="${label}"], textarea[name*="${label}"]`);
    if (!el) return false;
    await el.fill('');
    await el.fill(value);
    return true;
  } catch { return false; }
}

async function selectRadioByValue(frame: Frame, groupName: string, value: string): Promise<boolean> {
  try {
    const radio = await frame.$(`input[name="${groupName}"][value="${value}"]`);
    if (!radio) return false;
    await radio.check();
    return true;
  } catch { return false; }
}

async function selectDropdown(frame: Frame, selectName: string, value: string): Promise<boolean> {
  try {
    await frame.selectOption(`select[name="${selectName}"]`, value);
    return true;
  } catch { return false; }
}

// ── Módulos ──────────────────────────────────────────────────

async function populateResumo(page: Page, nav: LattesNavigator, dryRun: boolean) {
  console.log('\n📝 1. DADOS GERAIS → Resumo');
  
  const mod = getModuleById('texto_inicial')!;
  await nav.openMenu(mod.menuPath[0]);
  await nav.clickSubmenuItem(mod.menuPath[1]);
  await page.waitForTimeout(3000);
  
  const frame = await findFormFrame(page);
  if (!frame) { console.error('❌ Frame não encontrado'); return; }
  
  const resumo = `Designer de Produto com formação em Comunicação Social e especialização em Gestão de Produtos Digitais. Atua em UX/UI Design, Design de Serviços, Inovação Digital e Design Centrado no Usuário, com experiência em projetos de plataformas SaaS, aplicativos mobile e portais institucionais para os setores de varejo, saúde, educação e serviços jurídicos.`;
  
  // Find the textarea for the resume
  const textarea = await frame.$('textarea[name="f_texto"], textarea');
  if (textarea) {
    if (!dryRun) {
      await textarea.fill('');
      await textarea.fill(resumo);
      // Save
      const saveBtn = await frame.$('input[value="Salvar"], button:has-text("Salvar")');
      if (saveBtn) await saveBtn.click();
      console.log('✅ Resumo preenchido e salvo');
    } else {
      console.log('🔒 [DRY-RUN] Resumo seria preenchido');
    }
  } else {
    console.log('❌ Textarea do resumo não encontrado');
  }
  
  await nav.takeSnapshot('populate_resumo');
}

async function populateIdiomas(page: Page, nav: LattesNavigator, dryRun: boolean) {
  console.log('\n📝 2. DADOS GERAIS → Idiomas');
  
  const mod = getModuleById('idiomas')!;
  await nav.openMenu(mod.menuPath[0]);
  await nav.clickSubmenuItem(mod.menuPath[1]);
  await page.waitForTimeout(3000);
  
  const frame = await findFormFrame(page);
  if (!frame) { console.error('❌ Frame não encontrado'); return; }
  
  // Read current state
  const fields = await nav.readFormFields(frame);
  console.log(`   Campos encontrados: ${fields.length}`);
  
  // Idiomas: Português (nativo), Inglês (avançado), Espanhol (conversação)
  // Need to add each language via "Incluir novo item"
  const idiomas = [
    { nome: 'Inglês', nivel: 'Avançado' },
    { nome: 'Espanhol', nivel: 'Intermediário' },
  ];
  
  for (const idioma of idiomas) {
    console.log(`   Adicionando: ${idioma.nome} (${idioma.nivel})`);
    
    if (!dryRun) {
      // Click "Incluir novo item"
      const incluirBtn = await frame.$('input[value="Incluir novo item"], a:has-text("Incluir novo item")');
      if (incluirBtn) {
        await incluirBtn.click();
        await page.waitForTimeout(3000);
        
        const formFrame = await findFormFrame(page);
        if (formFrame) {
          // Fill language name
          await fillFieldBySelector(formFrame, 'input[name="f_idioma"]', idioma.nome);
          // Select proficiency level
          await selectDropdown(formFrame, 'f_proficiencia', idioma.nivel);
          // Save
          const saveBtn = await formFrame.$('input[value="Salvar"], button:has-text("Salvar")');
          if (saveBtn) await saveBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  }
  
  console.log('✅ Idiomas processados');
  await nav.takeSnapshot('populate_idiomas');
}

async function populateFormacao(page: Page, nav: LattesNavigator, dryRun: boolean) {
  console.log('\n📝 3. FORMAÇÃO → Formação Acadêmica');
  
  const formacoes = [
    {
      nivel: 'GRADUAÇÃO',
      curso: 'Comunicação Social',
      instituicao: 'Estácio São Luís',
      anoInicio: '2012',
      anoFim: '2016',
      status: 'Concluído',
    },
    {
      nivel: 'ESPECIALIZAÇÃO',
      curso: 'Gestão de Produtos Digitais',
      instituicao: 'FIAP',
      anoInicio: '2025',
      anoFim: '2026',
      status: 'Concluído',
    },
    {
      nivel: 'MESTRADO',
      curso: 'Design Centrado no Usuário (disciplina isolada)',
      instituicao: 'Universidade Federal do Paraná',
      anoInicio: '2025',
      anoFim: '2025',
      status: 'Concluído',
    },
  ];
  
  const mod = getModuleById('formacao_academica')!;
  await nav.openMenu(mod.menuPath[0]);
  await nav.clickSubmenuItem(mod.menuPath[1]);
  await page.waitForTimeout(3000);
  
  for (const form of formacoes) {
    console.log(`   Adicionando: ${form.nivel} - ${form.curso}`);
    
    if (!dryRun) {
      const frame = await findFormFrame(page);
      if (!frame) continue;
      
      // Click "Incluir novo item"
      const incluirBtn = await frame.$('input[value="Incluir novo item"], a:has-text("Incluir novo item")');
      if (incluirBtn) {
        await incluirBtn.click();
        await page.waitForTimeout(3000);
        
        // The form opens - select level first
        const formFrame = await findFormFrame(page);
        if (formFrame) {
          // Select education level
          await selectDropdown(formFrame, 'f_nivel', form.nivel);
          await page.waitForTimeout(2000);
          
          // Fill course name
          await fillFieldBySelector(formFrame, 'input[name="f_curso"]', form.curso);
          // Fill institution (lupa field)
          // TODO: Handle lupa for institution
          // Fill years
          await fillFieldBySelector(formFrame, 'input[name="f_ano_ini"]', form.anoInicio);
          await fillFieldBySelector(formFrame, 'input[name="f_ano_fim"]', form.anoFim);
          
          // Save
          const saveBtn = await formFrame.$('input[value="Salvar"], button:has-text("Salvar")');
          if (saveBtn) await saveBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  }
  
  console.log('✅ Formação acadêmica processada');
  await nav.takeSnapshot('populate_formacao');
}

async function populateAtuacao(page: Page, nav: LattesNavigator, dryRun: boolean) {
  console.log('\n📝 4. ATUAÇÃO → Atuação Profissional');
  
  const vinculos = [
    {
      instituicao: 'SENAC Maranhão',
      vinculo: 'Emprego privado',
      enquadramento: 'Professor de Editoração Eletrônica',
      cargaHoraria: '40',
      mesInicio: '01',
      anoInicio: '2008',
      mesFim: '12',
      anoFim: '2011',
      statusAtual: 'N',
    },
    {
      instituicao: 'Pipa Produções e Publicidade',
      vinculo: 'Sócio/Administrador',
      enquadramento: 'Lead Art Director',
      cargaHoraria: '40',
      mesInicio: '01',
      anoInicio: '2012',
      mesFim: '12',
      anoFim: '2015',
      statusAtual: 'N',
    },
    {
      instituicao: 'RocketArts',
      vinculo: 'Sócio/Administrador',
      enquadramento: 'Founder / Product Designer Leader',
      cargaHoraria: '40',
      mesInicio: '01',
      anoInicio: '2019',
      mesFim: '12',
      anoFim: '2021',
      statusAtual: 'N',
    },
    {
      instituicao: 'Platform Builders',
      vinculo: 'Emprego privado',
      enquadramento: 'Lead Product Designer',
      cargaHoraria: '40',
      mesInicio: '05',
      anoInicio: '2020',
      mesFim: '10',
      anoFim: '2023',
      statusAtual: 'N',
    },
    {
      instituicao: 'Builders Venture Studio',
      vinculo: 'Emprego privado',
      enquadramento: 'UX Design Lead / Head of Experimentation',
      cargaHoraria: '40',
      mesInicio: '10',
      anoInicio: '2023',
      mesFim: '02',
      anoFim: '2025',
      statusAtual: 'N',
    },
    {
      instituicao: 'Leany',
      vinculo: 'Emprego privado',
      enquadramento: 'Lead Product Design',
      cargaHoraria: '40',
      mesInicio: '03',
      anoInicio: '2025',
      statusAtual: 'S',
    },
  ];
  
  const mod = getModuleById('atuacao_profissional')!;
  await nav.openMenu(mod.menuPath[0]);
  await nav.clickSubmenuItem(mod.menuPath[1]);
  await page.waitForTimeout(3000);
  
  for (const vinc of vinculos) {
    console.log(`   Adicionando: ${vinc.instituicao} - ${vinc.enquadramento}`);
    
    if (!dryRun) {
      const frame = await findFormFrame(page);
      if (!frame) continue;
      
      // Click "Incluir novo item"
      const incluirBtn = await frame.$('input[value="Incluir novo item"], a:has-text("Incluir novo item")');
      if (incluirBtn) {
        await incluirBtn.click();
        await page.waitForTimeout(3000);
        
        const formFrame = await findFormFrame(page);
        if (formFrame) {
          // Fill institution (lupa field)
          // TODO: Handle lupa for institution
          await fillFieldBySelector(formFrame, 'input[name="f_enqua"]', vinc.enquadramento);
          await fillFieldBySelector(formFrame, 'input[name="f_carga"]', vinc.cargaHoraria);
          await fillFieldBySelector(formFrame, 'input[name="f_mes_ini"]', vinc.mesInicio);
          await fillFieldBySelector(formFrame, 'input[name="f_ano_ini"]', vinc.anoInicio);
          
          if (vinc.statusAtual === 'S') {
            await selectRadioByValue(formFrame, 'f_status', 'S');
          } else {
            await selectRadioByValue(formFrame, 'f_status', 'N');
            await fillFieldBySelector(formFrame, 'input[name="f_mes_fim"]', vinc.mesFim!);
            await fillFieldBySelector(formFrame, 'input[name="f_ano_fim"]', vinc.anoFim!);
          }
          
          // Save
          const saveBtn = await formFrame.$('input[value="Salvar"], button:has-text("Salvar")');
          if (saveBtn) await saveBtn.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  }
  
  console.log('✅ Atuação profissional processada');
  await nav.takeSnapshot('populate_atuacao');
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sectionArg = args.find(a => a.startsWith('--section'));
  const section = sectionArg ? args[args.indexOf(sectionArg) + 1] : null;
  
  console.log('🚀 POPULAÇÃO DO CURRÍCULO LATTES');
  console.log(`   Modo: ${dryRun ? '🔒 DRY-RUN (sem salvar)' : '🔥 PRODUÇÃO (salvando)'}`);
  if (section) console.log(`   Seção: ${section}`);
  console.log('');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  console.log('✅ Sessão autenticada');
  
  // Execute sections
  if (!section || section === 'resumo') await populateResumo(page, nav, dryRun);
  if (!section || section === 'idiomas') await populateIdiomas(page, nav, dryRun);
  if (!section || section === 'formacao') await populateFormacao(page, nav, dryRun);
  if (!section || section === 'atuacao') await populateAtuacao(page, nav, dryRun);
  
  console.log('\n✅ População concluída!');
  console.log('📸 Screenshots salvos em data/snapshots/');
  
  await session.close();
}

main().catch(console.error);
