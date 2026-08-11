/**
 * ITERAÇÃO 5: Popular TODOS os vínculos de atuação profissional
 * 
 * SENAC já salvo na Iteração 4. Faltam: Pipa, RocketArts, Platform Builders,
 * Builders Venture Studio, Leany.
 * 
 * Uso: npx tsx src/populate-atuacao-todos.ts [--dry-run]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Vinculo {
  instituicao: string;      // termo de busca no CNPq
  vinculo: string;          // opção do dominio(): Servidor público, Celetista, Professor Visitante, Bolsista, Outro (especifique)
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
    instituicao: 'Pipa',
    vinculo: 'Outro (especifique)',
    enquadramento: 'Diretor de Arte / Fundador',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2012',
    mesFim: '12', anoFim: '2015',
    statusAtual: false,
    descricao: 'Fundou e atuou como Diretor de Arte da Agência Pipa, agência pioneira de publicidade digital no Maranhão, atendendo mais de 30 clientes ao longo de quatro anos.',
  },
  {
    instituicao: 'RocketArts',
    vinculo: 'Outro (especifique)',
    enquadramento: 'Product Designer Leader / Fundador',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2019',
    mesFim: '12', anoFim: '2021',
    statusAtual: false,
    descricao: 'Fundou a RocketArts, startup digital de conteúdo por assinatura para setores profissionais, alcançando mais de 1.000 assinantes no Brasil com uso de automação e IA.',
  },
  {
    instituicao: 'Platform Builders',
    vinculo: 'Outro (especifique)',
    enquadramento: 'Lead Product Designer',
    cargaHoraria: '40',
    mesInicio: '05', anoInicio: '2020',
    mesFim: '10', anoFim: '2023',
    statusAtual: false,
    descricao: 'Atuou como Lead Product Designer conduzindo projetos de grande escala para Carrefour Brasil (SVA+) e Grupo DPSP (Portal da Saúde, E-commerce).',
  },
  {
    instituicao: 'Builders Venture Studio',
    vinculo: 'Outro (especifique)',
    enquadramento: 'UX Design Lead',
    cargaHoraria: '40',
    mesInicio: '10', anoInicio: '2023',
    mesFim: '02', anoFim: '2025',
    statusAtual: false,
    descricao: 'Atuou como UX Design Lead e Head of Experimentation, conduzindo prototipagem e experimentos para validar produtos e conceitos.',
  },
  {
    instituicao: 'Leany',
    vinculo: 'Outro (especifique)',
    enquadramento: 'Lead Product Design',
    cargaHoraria: '40',
    mesInicio: '03', anoInicio: '2025',
    statusAtual: true,
    descricao: 'Lidera a estratégia de design e experiência do usuário na Leany, desenvolvendo soluções com No-Code, AI-Code e Automação para plataformas SaaS, Web3, fintech, e-commerce e healthtech.',
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
  const dryRun = process.argv.includes('--dry-run');
  console.log(`🧪 ITERAÇÃO 5: Atuação profissional completa (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})\n`);
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navegar
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  let success = 0;
  let failed = 0;
  
  for (const vinc of VINCULOS) {
    console.log(`\n📌 ${vinc.enquadramento} @ ${vinc.instituicao}`);
    
    if (dryRun) {
      console.log('   🔒 [DRY-RUN]');
      success++;
      continue;
    }
    
    // Abrir novo
    const clickResult = await nav.clickNewRecord();
    if (!clickResult.success) {
      console.log(`   ❌ Abrir form: ${clickResult.error}`);
      failed++;
      continue;
    }
    
    const formFrame = await findFormFrame(page);
    if (!formFrame) {
      console.log('   ❌ Form frame não encontrado');
      failed++;
      continue;
    }
    
    try {
      // 1. Lupa instituição
      const lupaResult = await nav.fillLupa('f_inst', vinc.instituicao, formFrame);
      const instVal = await formFrame.evaluate(() => 
        (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
      
      if (!instVal) {
        console.log(`   ⚠️  Instituição não preenchida (lupa ${lupaResult.success ? 'ok' : 'falhou'})`);
        // Try with different search term
        const altTerms = [vinc.instituicao.split(' ')[0], vinc.instituicao.toUpperCase()];
        for (const term of altTerms) {
          await nav.fillLupa('f_inst', term, formFrame);
          const v2 = await formFrame.evaluate(() => 
            (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
          if (v2) {
            console.log(`   ✅ Instituição (tentativa ${term}): "${v2}"`);
            break;
          }
        }
        const final = await formFrame.evaluate(() => 
          (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
        if (!final) {
          console.log('   ❌ Instituição não encontrada no CNPq — pulando');
          await nav.closeModal();
          await page.waitForTimeout(1000);
          failed++;
          continue;
        }
      } else {
        console.log(`   ✅ Instituição: "${instVal}"`);
      }
      
      // 2. Vínculo dominio
      const vincResult = await nav.fillLupa('f_vinc', vinc.vinculo, formFrame);
      console.log(`   ${vincResult.success ? '✅' : '❌'} Vínculo: ${vinc.vinculo}`);
      
      // 3. Campos
      const fields: [string, string][] = [
        ['f_enqua', vinc.enquadramento],
        ['f_carga', vinc.cargaHoraria],
        ['f_mes_ini', vinc.mesInicio],
        ['f_ano_ini', vinc.anoInicio],
      ];
      if (vinc.mesFim) fields.push(['f_mes_fim', vinc.mesFim]);
      if (vinc.anoFim) fields.push(['f_ano_fim', vinc.anoFim]);
      
      for (const [name, value] of fields) {
        await fillFast(formFrame, name, value);
      }
      console.log('   ✅ Campos preenchidos');
      
      // 4. Status radio
      const radioVal = vinc.statusAtual ? 'S' : 'N';
      const radio = await formFrame.$(`input[name="f_status"][value="${radioVal}"]`);
      if (radio) {
        await radio.evaluate((el: HTMLInputElement) => {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('click', { bubbles: true }));
        });
      }
      console.log(`   ✅ Status: ${vinc.statusAtual ? 'Atual' : 'Anterior'}`);
      
      // 5. Descrição
      await fillFast(formFrame, 'f_outras_inf', vinc.descricao);
      
      // 6. Salvar
      const saveResult = await nav.confirmAndSave(formFrame);
      if (saveResult.success) {
        console.log('   ✅✅ SALVO!');
        success++;
      } else {
        console.log(`   ❌ ${saveResult.error}`);
        // Check for visible error dialog and close it
        const bodyText = await formFrame.textContent('body').catch(() => '') || '';
        if (bodyText.includes('Não foi possível') || bodyText.includes('obrigatório não informado')) {
          const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
          if (confirmBtn) await confirmBtn.click();
        }
        failed++;
      }
      
    } catch (e) {
      console.log(`   ❌ Erro: ${(e as Error).message}`);
      failed++;
    }
    
    // Fechar modal
    await nav.closeModal();
    await page.waitForTimeout(1500);
  }
  
  console.log(`\n📊 Resultado: ${success} salvo(s), ${failed} falha(s)`);
  
  // Verificar lista final
  console.log('\n📋 Lista final:');
  const listResult = await nav.readModuleList();
  if (listResult.success) {
    const records = listResult.data?.records || [];
    console.log(`   Registros: ${records.length}`);
    for (const rec of records) console.log(`   • ${rec.text}`);
  }
  
  await session.close();
  console.log('\n✅ Iteração 5 concluída');
}

main().catch(console.error);
