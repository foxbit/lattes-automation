/**
 * Popula atuação profissional no Lattes
 * Uso: npx tsx src/populate-atuacao.ts [--dry-run]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Vinculo {
  instituicao: string;
  vinculo: string;
  enquadramento: string;
  cargaHoraria: string;
  mesInicio: string;
  anoInicio: string;
  mesFim?: string;
  anoFim?: string;
  statusAtual: boolean;
  descricao?: string;
}

const VINCULOS: Vinculo[] = [
  {
    instituicao: 'SENAC Maranhão',
    vinculo: 'Emprego privado',
    enquadramento: 'Professor de Editoração Eletrônica',
    cargaHoraria: '40',
    mesInicio: '01',
    anoInicio: '2008',
    mesFim: '12',
    anoFim: '2011',
    statusAtual: false,
    descricao: 'Ministrou disciplinas de editoração eletrônica, abordando ferramentas de design gráfico, diagramação e produção de material digital para alunos do ensino técnico e profissionalizante.',
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
    statusAtual: false,
    descricao: 'Fundou e atuou como Diretor de Arte da Agência Pipa, agência pioneira de publicidade digital no Maranhão. Atendeu mais de 30 clientes ao longo de quatro anos. Liderou equipe de 12 pessoas focada no planejamento, criação e execução de campanhas publicitárias para clientes institucionais e varejo em mídias digitais e tradicionais.',
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
    statusAtual: false,
    descricao: 'Fundou a RocketArts, startup digital de serviços de conteúdo por assinatura para diversos setores profissionais. Utilizando automação e IA, entregava pacotes semanais de conteúdo personalizado. Alcançou mais de 1.000 assinantes em todo o Brasil.',
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
    statusAtual: false,
    descricao: 'Atuou como Lead Product Designer conduzindo projetos de grande escala para Carrefour Brasil (SVA+) e Grupo DPSP (Portal da Saúde, E-commerce).',
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
    statusAtual: false,
    descricao: 'Prototipagem e condução de experimentos para testar e validar ideias, produtos e conceitos. Geração de conceitos de serviço por meio de prototipagem para apresentação, validação e teste com usuários.',
  },
  {
    instituicao: 'Leany',
    vinculo: 'Emprego privado',
    enquadramento: 'Lead Product Design',
    cargaHoraria: '40',
    mesInicio: '03',
    anoInicio: '2025',
    statusAtual: true,
    descricao: 'Lidera a estratégia de design e experiência do usuário, desenvolvendo soluções ágeis utilizando No-Code, AI-Code e Automação para plataformas SaaS, Web3, fintech, e-commerce e healthtech.',
  },
];

async function findFormFrame(page: Page, waitMs = 8000): Promise<Frame | null> {
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(waitMs / 10);
    for (const f of page.frames()) {
      const u = f.url();
      if (u.includes('.form') || u.includes('.inclui') || u.includes('prc_')) return f;
    }
  }
  return null;
}

async function fillAndSave(page: Page, frame: Frame, vinc: Vinculo, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`   🔒 [DRY-RUN] Preencheria: ${vinc.enquadramento}`);
    return true;
  }

  try {
    // Institution field (lupa - needs special handling)
    const instInput = await frame.$('input[name="f_inst"]');
    if (instInput) {
      const isDisabled = await instInput.getAttribute('disabled');
      if (isDisabled !== null) {
        // It's a lupa field - need to click the search icon
        const lupaBtn = await frame.$('img[src*="lupa"], a[onclick*="sele_inst"], input[name="f_inst"] + a');
        if (lupaBtn) {
          await lupaBtn.click();
          await page.waitForTimeout(3000);
          // A search modal (modalCV3) should open
          // For now, we'll skip the lupa and try to fill directly
          console.log(`   ⚠️  Campo lupa (instituição) - preenchimento manual necessário`);
        }
      }
      // Try to fill directly even if disabled
      await instInput.evaluate((el: HTMLInputElement) => {
        el.removeAttribute('disabled');
        el.value = '';
      });
      await instInput.fill(vinc.instituicao);
    }

    // Employment type
    const vincInput = await frame.$('input[name="f_vinc"]');
    if (vincInput) {
      await vincInput.evaluate((el: HTMLInputElement) => el.removeAttribute('disabled'));
      await vincInput.fill(vinc.vinculo);
    }

    // Job title
    await (await frame.$('input[name="f_enqua"]'))?.fill(vinc.enquadramento);
    
    // Hours per week
    await (await frame.$('input[name="f_carga"]'))?.fill(vinc.cargaHoraria);
    
    // Start date
    await (await frame.$('input[name="f_mes_ini"]'))?.fill(vinc.mesInicio);
    await (await frame.$('input[name="f_ano_ini"]'))?.fill(vinc.anoInicio);
    
    // Current status
    if (vinc.statusAtual) {
      const radio = await frame.$('input[name="f_status"][value="S"]');
      if (radio) await radio.check();
    } else {
      const radio = await frame.$('input[name="f_status"][value="N"]');
      if (radio) await radio.check();
      await page.waitForTimeout(1000);
      await (await frame.$('input[name="f_mes_fim"]'))?.fill(vinc.mesFim!);
      await (await frame.$('input[name="f_ano_fim"]'))?.fill(vinc.anoFim!);
    }

    // Description
    const descField = await frame.$('textarea[name="f_outras_inf"]');
    if (descField && vinc.descricao) {
      await descField.fill(vinc.descricao);
    }

    // Save
    const allButtons = await frame.$$('input[type="button"], input[type="submit"], button, a');
    for (const btn of allButtons) {
      const text = await btn.textContent().catch(() => '');
      const val = await btn.getAttribute('value').catch(() => '');
      if ((text || '').includes('Salvar') || (val || '').includes('Salvar')) {
        await btn.click();
        await page.waitForTimeout(3000);
        return true;
      }
    }
    
    console.log('   ⚠️  Botão Salvar não encontrado');
    return false;
  } catch (e) {
    console.log(`   ❌ Erro: ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`📝 Populando atuação profissional (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);
  console.log(`   ${VINCULOS.length} vínculos para cadastrar\n`);
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate to Atuação profissional
  console.log('📂 Navegando para Atuação > Atuação profissional...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  // Find list frame
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ.lista')) {
      listFrame = f;
      break;
    }
  }
  if (!listFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') {
        listFrame = f;
        break;
      }
    }
  }
  
  if (!listFrame) {
    console.error('❌ Frame da lista não encontrado');
    await session.close();
    return;
  }
  
  console.log(`   Frame: ${listFrame.url()}\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const vinc of VINCULOS) {
    console.log(`📌 ${vinc.instituicao} — ${vinc.enquadramento}`);
    
    // Click "Incluir novo item"
    if (!dryRun) {
      const incluirBtn = await listFrame.$('input[value="Incluir novo item"], a:has-text("Incluir novo item"), input[onclick*="modalCV2"]');
      if (incluirBtn) {
        await incluirBtn.click();
        await page.waitForTimeout(5000);
        
        const formFrame = await findFormFrame(page);
        if (formFrame) {
          const ok = await fillAndSave(page, formFrame, vinc, dryRun);
          if (ok) {
            console.log(`   ✅ Salvo`);
            success++;
          } else {
            console.log(`   ❌ Falhou`);
            failed++;
          }
          // Close the form modal
          const closeBtn = await formFrame.$('input[value="Fechar"], a:has-text("Fechar"), input[onclick*="fechar"]');
          if (closeBtn) await closeBtn.click();
          await page.waitForTimeout(2000);
        } else {
          console.log('   ❌ Frame do formulário não encontrado');
          failed++;
        }
      } else {
        console.log('   ❌ Botão "Incluir novo item" não encontrado');
        failed++;
      }
    } else {
      console.log(`   🔒 [DRY-RUN]`);
      success++;
    }
  }
  
  console.log(`\n📊 Resultado: ${success} sucesso, ${failed} falhas`);
  
  await nav.takeSnapshot('populate_atuacao');
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
