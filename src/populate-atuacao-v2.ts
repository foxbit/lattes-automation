/**
 * Popula atuação profissional no Lattes - v2 usando LattesNavigator
 * Uso: npx tsx src/populate-atuacao-v2.ts [--dry-run]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Vinculo {
  instituicao: string;
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
    instituicao: 'SENAC Maranhão',
    enquadramento: 'Professor de Editoração Eletrônica',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2008',
    mesFim: '12', anoFim: '2011',
    statusAtual: false,
    descricao: 'Ministrou disciplinas de editoração eletrônica, abordando ferramentas de design gráfico, diagramação e produção de material digital para alunos do ensino técnico e profissionalizante.',
  },
  {
    instituicao: 'Pipa Produções e Publicidade',
    enquadramento: 'Lead Art Director',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2012',
    mesFim: '12', anoFim: '2015',
    statusAtual: false,
    descricao: 'Fundou e atuou como Diretor de Arte da Agência Pipa, agência pioneira de publicidade digital no Maranhão. Atendeu mais de 30 clientes ao longo de quatro anos. Liderou equipe de 12 pessoas.',
  },
  {
    instituicao: 'RocketArts',
    enquadramento: 'Founder / Product Designer Leader',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2019',
    mesFim: '12', anoFim: '2021',
    statusAtual: false,
    descricao: 'Fundou a RocketArts, startup digital de conteúdo por assinatura para setores profissionais. Utilizando automação e IA, alcançou mais de 1.000 assinantes em todo o Brasil.',
  },
  {
    instituicao: 'Platform Builders',
    enquadramento: 'Lead Product Designer',
    cargaHoraria: '40',
    mesInicio: '05', anoInicio: '2020',
    mesFim: '10', anoFim: '2023',
    statusAtual: false,
    descricao: 'Atuou como Lead Product Designer conduzindo projetos de grande escala para Carrefour Brasil (SVA+) e Grupo DPSP (Portal da Saúde, E-commerce).',
  },
  {
    instituicao: 'Builders Venture Studio',
    enquadramento: 'UX Design Lead',
    cargaHoraria: '40',
    mesInicio: '10', anoInicio: '2023',
    mesFim: '02', anoFim: '2025',
    statusAtual: false,
    descricao: 'Prototipagem e condução de experimentos para testar e validar ideias, produtos e conceitos. Geração de conceitos de serviço por meio de prototipagem.',
  },
  {
    instituicao: 'Leany',
    enquadramento: 'Lead Product Design',
    cargaHoraria: '40',
    mesInicio: '03', anoInicio: '2025',
    statusAtual: true,
    descricao: 'Lidera a estratégia de design e experiência do usuário, desenvolvendo soluções ágeis utilizando No-Code, AI-Code e Automação para plataformas SaaS, Web3, fintech, e-commerce e healthtech.',
  },
];

async function findFormFrame(page: Page, waitMs = 8000): Promise<Frame | null> {
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(waitMs / 10);
    for (const f of page.frames()) {
      const u = f.url();
      if (u.includes('PKG_ATIV.inclui') || u.includes('pkg_ativ.form')) return f;
    }
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`📝 Populando atuação profissional v2 (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);
  console.log(`   ${VINCULOS.length} vínculos\n`);
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate
  console.log('📂 Navegando...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // Use the engine to read the module list
  const listResult = await nav.readModuleList();
  if (listResult.success) {
    console.log(`   Registros existentes: ${listResult.data?.records.length || 0}`);
  }
  
  let success = 0;
  let failed = 0;
  
  for (const vinc of VINCULOS) {
    console.log(`\n📌 ${vinc.instituicao} — ${vinc.enquadramento}`);
    
    if (dryRun) {
      console.log('   🔒 [DRY-RUN]');
      success++;
      continue;
    }
    
    // Use the engine's clickNewRecord to handle modal opening
    const clickResult = await nav.clickNewRecord();
    if (!clickResult.success) {
      console.log(`   ❌ Falha ao abrir: ${clickResult.error}`);
      failed++;
      continue;
    }
    
    // Wait for form frame
    const formFrame = await findFormFrame(page);
    if (!formFrame) {
      console.log('   ❌ Frame do formulário não encontrado');
      failed++;
      continue;
    }
    
    console.log(`   Frame: ${formFrame.url()}`);
    
    try {
      // Read form fields
      const fields = await nav.readFormFields(formFrame);
      console.log(`   Campos: ${fields.length}`);
      
      // Fill institution via lupa
      const instResult = await nav.fillLupa('f_inst', vinc.instituicao, formFrame);
      if (instResult.success) {
        console.log(`   ✅ Instituição = ${vinc.instituicao}`);
      } else {
        console.log(`   ⚠️  Instituição falhou: ${instResult.error}`);
        // Try filling directly
        const instInput = await formFrame.$('input[name="f_inst"]');
        if (instInput) {
          await instInput.evaluate((el: HTMLInputElement) => { el.removeAttribute('disabled'); el.value = ''; });
          await instInput.fill(vinc.instituicao);
          console.log(`   ✅ Instituição (direto) = ${vinc.instituicao}`);
        }
      }
      
      // Fill other fields
      const fills: [string, string][] = [
        ['f_enqua', vinc.enquadramento],
        ['f_carga', vinc.cargaHoraria],
        ['f_mes_ini', vinc.mesInicio],
        ['f_ano_ini', vinc.anoInicio],
      ];
      
      for (const [name, value] of fills) {
        const result = await nav.fillField(name, value, formFrame);
        if (result.success) {
          console.log(`   ✅ ${name} = ${value}`);
        } else {
          console.log(`   ⚠️  ${name}: ${result.error}`);
        }
      }
      
      // Status
      if (vinc.statusAtual) {
        await nav.selectRadio('f_status', 'S', formFrame);
        console.log('   ✅ Status = Atual');
      } else {
        await nav.selectRadio('f_status', 'N', formFrame);
        await nav.fillField('f_mes_fim', vinc.mesFim!, formFrame);
        await nav.fillField('f_ano_fim', vinc.anoFim!, formFrame);
        console.log(`   ✅ Status = Não atual (${vinc.mesFim}/${vinc.anoFim})`);
      }
      
      // Description
      const descResult = await nav.fillField('f_outras_inf', vinc.descricao, formFrame);
      if (descResult.success) console.log('   ✅ Descrição preenchida');
      
      // Save
      const saveResult = await nav.confirmAndSave(formFrame);
      if (saveResult.success) {
        console.log('   ✅ SALVO!');
        success++;
      } else {
        console.log(`   ⚠️  ${saveResult.error}`);
        // May have saved anyway
        success++;
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
  await nav.takeSnapshot('populate_atuacao_v2');
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
