/**
 * Popula projetos de desenvolvimento tecnológico no Lattes
 * Uso: npx tsx src/populate-projetos.ts [--dry-run]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Projeto {
  nome: string;
  situacao: 'Concluído' | 'Em andamento';
  anoInicio: string;
  anoFim?: string;
  instituicao: string;
  descricao: string;
}

const PROJETOS: Projeto[] = [
  {
    nome: 'SVA+ — Plataforma de Vendas para o Setor de Eletro',
    situacao: 'Concluído',
    anoInicio: '2022',
    anoFim: '2023',
    instituicao: 'Platform Builders (Carrefour Brasil)',
    descricao: 'Plataforma de vendas criada para o setor de eletro do Carrefour Brasil, que digitalizou o atendimento nas lojas físicas ao permitir que vendedores realizassem consultas de estoque, comparação de produtos e fechamento de vendas diretamente pelo aplicativo. Incluiu dashboard de comissões e metas, back-office para gestão de dados, e prototipagem com testes de usabilidade com usuários finais. Projeto conduzido do conceito inicial até a implementação nas primeiras 20 lojas.',
  },
  {
    nome: 'Portal de Serviços de Saúde — Grupo DPSP',
    situacao: 'Concluído',
    anoInicio: '2021',
    anoFim: '2022',
    instituicao: 'Platform Builders (Grupo DPSP)',
    descricao: 'Projeto de expansão do portal de serviços do Grupo DPSP — maior grupo farmacêutico da América Latina. Evoluiu o MVP inicial em uma plataforma robusta com agendamento de vacinas, carteira de vacinação digital, sessões de psicoterapia, testes de COVID-19 e telemedicina. Integrou startups parceiras para ampliar as ofertas de serviços.',
  },
  {
    nome: 'Redesign do E-commerce — Grupo DPSP',
    situacao: 'Concluído',
    anoInicio: '2020',
    anoFim: '2021',
    instituicao: 'Platform Builders (Grupo DPSP)',
    descricao: 'Redesign do portal de vendas do Grupo DPSP (Drogaria São Paulo e Drogaria Pacheco). Modernização da plataforma de e-commerce com foco em usabilidade e acessibilidade, impactando diretamente nas taxas de conversão e satisfação do cliente. Incluiu pesquisa com usuários, mapeamento de jornadas e redesign da interface.',
  },
  {
    nome: 'Plataforma de Votação — Prêmio Impactos Positivos',
    situacao: 'Concluído',
    anoInicio: '2024',
    anoFim: '2024',
    instituicao: 'Sebrae Brasil',
    descricao: 'Plataforma digital de votação criada para o Prêmio Impactos Positivos, iniciativa do Sebrae Brasil que seleciona as maiores iniciativas de impacto social do país. O concurso 2024 contou com 250 projetos inscritos nos 24 estados e mais de 35 mil votos. Responsável pela arquitetura, design e produção da plataforma.',
  },
  {
    nome: 'Portal Institucional FIEMA',
    situacao: 'Concluído',
    anoInicio: '2024',
    anoFim: '2024',
    instituicao: 'Federação das Indústrias do Estado do Maranhão',
    descricao: 'Criação de novo portal institucional para a FIEMA, integrando visualmente suas três entidades (SENAI, SESI e IEL) em uma plataforma moderna, padronizada e acessível. Projeto incluiu pesquisa com stakeholders, definição de arquitetura de informação e design de interface responsivo.',
  },
  {
    nome: 'Discovery para Transformação Digital da OAB-PR',
    situacao: 'Concluído',
    anoInicio: '2025',
    anoFim: '2025',
    instituicao: 'OAB Paraná',
    descricao: 'Projeto de Discovery para a OAB Paraná, mapeando as necessidades dos advogados paranaenses para modernizar e transformar digitalmente os serviços da instituição. Incluiu pesquisa com usuários, mapeamento de jornadas, definição de prioridades e roadmap de produto.',
  },
  {
    nome: 'Plataforma Central de Gerenciamento Acadêmico',
    situacao: 'Concluído',
    anoInicio: '2025',
    anoFim: '2025',
    instituicao: 'Insper',
    descricao: 'Design de aplicação web para centralizar e otimizar o gerenciamento de cursos, salas e recursos do Insper, utilizando abordagem de design assistida por inteligência artificial.',
  },
  {
    nome: 'Advoprazo — Plataforma de Gestão de Prazos Processuais',
    situacao: 'Em andamento',
    anoInicio: '2025',
    instituicao: 'Advoprazo',
    descricao: 'Design de plataforma digital para automatizar o monitoramento de processos e organizar a rotina de advogados autônomos, focada em clareza, controle de prazos e redução de carga cognitiva.',
  },
  {
    nome: 'Plataforma de Gestão de Investimentos',
    situacao: 'Em andamento',
    anoInicio: '2025',
    instituicao: 'Primo Investment Fund',
    descricao: 'Desenvolvimento de plataforma web para digitalizar e otimizar o fluxo de aprovação de propostas de investimento, trazendo eficiência, transparência e rastreabilidade ao processo decisório.',
  },
  {
    nome: 'Unificação do Ecossistema de Estudos PP Concursos',
    situacao: 'Em andamento',
    anoInicio: '2025',
    instituicao: 'PP Concursos',
    descricao: 'Design de interface focado na escalabilidade de uma mentoria educacional. Solução unifica ferramentas dispersas em uma plataforma SaaS robusta, utilizada por milhares de estudantes de concursos públicos.',
  },
  {
    nome: 'Discovery para Transformação em EdTech — PP Concursos',
    situacao: 'Concluído',
    anoInicio: '2025',
    anoFim: '2025',
    instituicao: 'Ponto a Ponto Concursos',
    descricao: 'Processo de Discovery para mapear funcionalidades e jornadas, convertendo uma mentoria artesanal em uma plataforma educacional tecnológica.',
  },
];

async function findFormFrame(page: Page, waitMs = 10000): Promise<Frame | null> {
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(waitMs / 10);
    for (const f of page.frames()) {
      const u = f.url();
      if (u.includes('.form') || u.includes('.inclui') || u.includes('prc_')) return f;
    }
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`📝 Populando projetos (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);
  console.log(`   ${PROJETOS.length} projetos para cadastrar\n`);
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate to Projetos de desenvolvimento tecnológico
  console.log('📂 Navegando para Projetos > Projeto de desenvolvimento tecnológico...');
  await nav.openMenu('Projetos');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Projeto de desenvolvimento tecnológico');
  await page.waitForTimeout(5000);
  
  // Find list frame
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_projeto.lista')) {
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
  
  for (const proj of PROJETOS) {
    console.log(`📌 [${proj.anoInicio}] ${proj.nome}`);
    
    if (!dryRun) {
      // Click "Incluir novo item"
      const incluirBtn = await listFrame.$('input[value="Incluir novo item"], a:has-text("Incluir novo item"), input[onclick*="modalCV2"]');
      if (incluirBtn) {
        await incluirBtn.click();
        await page.waitForTimeout(8000);
        
        const formFrame = await findFormFrame(page);
        if (formFrame) {
          try {
            // Fill project name
            await (await formFrame.$('input[name="f_nome"]'))?.fill(proj.nome);
            
            // Status
            if (proj.situacao === 'Concluído') {
              const radio = await formFrame.$('input[name="f_status"][value="C"]');
              if (radio) await radio.check();
            } else {
              const radio = await formFrame.$('input[name="f_status"][value="E"]');
              if (radio) await radio.check();
            }
            
            // Natureza - select "Desenvolvimento tecnológico"
            try {
              await formFrame.selectOption('select[name="f_natureza"]', { label: 'Desenvolvimento tecnológico' });
            } catch {}
            
            // Years
            await (await formFrame.$('input[name="f_ano_ini"]'))?.fill(proj.anoInicio);
            if (proj.anoFim) {
              await (await formFrame.$('input[name="f_ano_fim"]'))?.fill(proj.anoFim);
            }
            
            // Description
            const descField = await formFrame.$('textarea[name="f_descricao"], textarea');
            if (descField) {
              await descField.fill(proj.descricao);
            }
            
            // Save
            const allButtons = await formFrame.$$('input[type="button"], input[type="submit"], button, a');
            let saved = false;
            for (const btn of allButtons) {
              const text = await btn.textContent().catch(() => '');
              const val = await btn.getAttribute('value').catch(() => '');
              if ((text || '').includes('Salvar') || (val || '').includes('Salvar')) {
                await btn.click();
                await page.waitForTimeout(3000);
                saved = true;
                break;
              }
            }
            
            if (saved) {
              console.log('   ✅ Salvo');
              success++;
            } else {
              console.log('   ⚠️  Salvar não encontrado');
              failed++;
            }
          } catch (e) {
            console.log(`   ❌ Erro: ${(e as Error).message}`);
            failed++;
          }
          
          // Close modal
          const closeBtn = await formFrame.$('input[value="Fechar"], a:has-text("Fechar")');
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
      console.log('   🔒 [DRY-RUN]');
      success++;
    }
  }
  
  console.log(`\n📊 Resultado: ${success} sucesso, ${failed} falhas`);
  
  await nav.takeSnapshot('populate_projetos');
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
