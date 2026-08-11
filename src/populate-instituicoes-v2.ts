/**
 * Cadastra instituições novas (Pipa, Platform Builders, Leany) + preenche vínculos — v2
 * 
 * Correções vs v1:
 * - Handler page.on('dialog') para responder prompt() do "Outro (especifique)"
 * - Remove caixaMsg sobreposta antes de cliques
 * - Usa force click no Confirmar
 * 
 * Uso: npx tsx src/populate-instituicoes-v2.ts [--dry-run]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Vinculo {
  nomeInst: string;
  sigla: string;
  uf: string;
  busca: string;
  vinculo: string;           // opção do dominio()
  vinculoTipo: string;       // texto para prompt() quando "Outro (especifique)"
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
    nomeInst: 'Pipa Produções e Publicidade Ltda',
    sigla: 'PIPA',
    uf: 'MA',
    busca: 'Pipa Produções e Publicidade',
    vinculo: 'Outro (especifique)',
    vinculoTipo: 'Sócio',
    enquadramento: 'Diretor de Arte / Fundador',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2012',
    mesFim: '12', anoFim: '2015',
    statusAtual: false,
    descricao: 'Fundou e atuou como Diretor de Arte da Agência Pipa, agência pioneira de publicidade digital no Maranhão, atendendo mais de 30 clientes ao longo de quatro anos.',
  },
  {
    nomeInst: 'Platform Builders IT Solutions Ltda',
    sigla: 'PB',
    uf: 'SP',
    busca: 'Platform Builders IT Solutions',
    vinculo: 'Outro (especifique)',
    vinculoTipo: 'Pessoa Jurídica',
    enquadramento: 'Lead Product Designer',
    cargaHoraria: '40',
    mesInicio: '05', anoInicio: '2020',
    mesFim: '10', anoFim: '2023',
    statusAtual: false,
    descricao: 'Atuou como Lead Product Designer conduzindo projetos de grande escala para Carrefour Brasil (SVA+) e Grupo DPSP (Portal da Saúde, E-commerce).',
  },
  {
    nomeInst: 'Leany Lean Ventures Ltda',
    sigla: 'LEANY',
    uf: 'SP',
    busca: 'Leany Lean Ventures',
    vinculo: 'Outro (especifique)',
    vinculoTipo: 'Pessoa Jurídica',
    enquadramento: 'Lead Product Design',
    cargaHoraria: '40',
    mesInicio: '03', anoInicio: '2025',
    statusAtual: true,
    descricao: 'Lidera a estratégia de design e experiência do usuário na Leany, desenvolvendo soluções com No-Code, AI-Code e Automação para plataformas SaaS, Web3, fintech, e-commerce e healthtech.',
  },
];

async function findFormFrame(page: Page, listUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listUrl && url !== page.mainFrame().url() && url !== 'about:blank'
        && (url.includes('PKG_ATIV') || url.includes('pkg_ativ'))) {
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

/** Remove caixaMsg/overlays que interceptam cliques */
async function clearOverlays(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, .win-overlay, .caixaMsg, .win-message, .blockOverlay').forEach(el => el.remove());
  }).catch(() => {});
  await page.waitForTimeout(300);
}

/** Abre a lupa de instituição e cadastra uma nova */
async function registerNewInstitution(page: Page, formFrame: Frame, v: Vinculo): Promise<boolean> {
  console.log('   🔍 Abrindo lupa de instituição...');
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
    if (el) el.click();
  });
  await page.waitForTimeout(4000);

  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) { console.log('   ❌ ModalCV3 não abriu'); return false; }

  // Buscar termo inexistente
  console.log(`   🔎 Buscando "${v.busca}"...`);
  await cv3Frame.evaluate((term: string) => {
    const inp = document.querySelector('input[name="f_nome"]') as HTMLInputElement;
    if (inp) {
      inp.value = term;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const form = document.querySelector('form[name="instituicaoForm"]');
    if (form) (form as HTMLFormElement).submit();
  }, v.busca);
  await page.waitForTimeout(5000);

  // Verificar se há resultado existente
  const hasResult = await cv3Frame.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    return links.some(a => (a.textContent || '').trim().length > 5 && a.textContent?.includes('('));
  });
  if (hasResult) {
    console.log('   ⚠️  Já existe no CNPq — selecionando');
    const clicked = await cv3Frame.evaluate((term: string) => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = (link.textContent || '').trim();
        if (text.toLowerCase().includes(term.toLowerCase().split(' ')[0].toLowerCase()) && text.includes('(')) {
          (link as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    }, v.busca);
    if (clicked.clicked) {
      console.log(`   ✅ Selecionado: ${clicked.text}`);
      await clearOverlays(page);
      return true;
    }
  }

  // Clicar "Cadastrar nova instituição"
  console.log('   🆕 Clicando "Cadastrar nova instituição"...');
  await clearOverlays(page);
  const cadastrarLink = await cv3Frame.$('a:has-text("Cadastrar nova instituição"), a:has-text("cadastrar nova")');
  if (!cadastrarLink) {
    console.log('   ❌ Link "Cadastrar" não encontrado');
    return false;
  }
  await cadastrarLink.click({ force: true }).catch(async () => {
    await cadastrarLink.evaluate((el: HTMLElement) => el.click());
  });
  await page.waitForTimeout(4000);

  // Preencher form
  await fillFast(cv3Frame, 'f_nme_inst', v.nomeInst);
  await fillFast(cv3Frame, 'f_sigla', v.sigla);
  console.log(`   ✅ Nome: ${v.nomeInst} (${v.sigla})`);

  try {
    await cv3Frame.selectOption('select[name="f_pais_inst"]', 'BRA');
    console.log('   ✅ País: Brasil');
  } catch { console.log('   ⚠️ País falhou'); }
  await page.waitForTimeout(500);

  try {
    await cv3Frame.selectOption('select[name="f_uf"]', v.uf);
    console.log(`   ✅ UF: ${v.uf}`);
  } catch { console.log('   ⚠️ UF falhou'); }
  await page.waitForTimeout(500);

  // Confirmar — com caixaMsg possível após
  console.log('   💾 Confirmando cadastro...');
  await clearOverlays(page);
  const confirmBtn = await cv3Frame.$('a[onclick*="check"], a:has-text("Confirmar"), input[value="Confirmar"]');
  if (confirmBtn) {
    await confirmBtn.click({ force: true }).catch(async () => {
      await confirmBtn.evaluate((el: HTMLElement) => el.click());
    });
  } else {
    await cv3Frame.evaluate(() => { (window as any).check?.(); });
  }
  await page.waitForTimeout(3000);

  // Fechar caixaMsg se apareceu (mensagem de sucesso/erro)
  const msgConfirm = await page.$('input[value="Confirmar"]');
  if (msgConfirm) {
    // Verificar se é a caixa de mensagem (caixaMsg) e não o form
    const inCaixa = await msgConfirm.evaluate((el) => {
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        if (p.className && (p.className as string).includes('caixaMsg')) return true;
        p = p.parentElement;
      }
      return false;
    });
    if (inCaixa) {
      console.log('   ⚠️ CaixaMsg detectada — clicando Confirmar');
      await msgConfirm.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }
  await clearOverlays(page);
  console.log('   ✅ Cadastro confirmado');
  return true;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`🏢 Instituições + vínculos v2 (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})\n`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // Handler de dialog para prompt() do "Outro (especifique)"
  page.on('dialog', async (dialog) => {
    console.log(`   💬 Dialog: ${dialog.type()} — ${dialog.message().substring(0, 80)}`);
    try {
      if (dialog.type() === 'prompt') {
        await dialog.accept('Pessoa Jurídica');
      } else {
        await dialog.accept();
      }
    } catch { /* ignore */ }
  });

  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }

  if (dryRun) {
    console.log('🔒 [DRY-RUN]');
    for (const v of VINCULOS) console.log(`   • ${v.nomeInst} (${v.sigla}, ${v.uf}) — ${v.enquadramento}`);
    await session.close();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const v of VINCULOS) {
    console.log(`\n📌 ${v.enquadramento} @ ${v.nomeInst}`);

    await nav.clickNewRecord();
    const formFrame = await findFormFrame(page, listFrame.url());
    if (!formFrame) { console.log('   ❌ Form'); failed++; continue; }

    try {
      // 1. Cadastrar instituição
      const instOk = await registerNewInstitution(page, formFrame, v);
      if (!instOk) {
        console.log('   ❌ Falha no cadastro');
        failed++;
        await nav.closeModal();
        await page.waitForTimeout(1000);
        continue;
      }

      const instVal = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
      console.log(`   🏫 f_inst = "${instVal}"`);
      if (!instVal) {
        console.log('   ❌ Instituição vazia');
        failed++;
        await nav.closeModal();
        await page.waitForTimeout(1000);
        continue;
      }

      // 2. Vínculo — o prompt() é respondido pelo handler
      console.log(`   🔗 Vínculo: ${v.vinculo} (${v.vinculoTipo})`);
      const vincResult = await nav.fillLupa('f_vinc', v.vinculo, formFrame);
      console.log(`   ${vincResult.success ? '✅' : '❌'} dominio() ok`);

      // Verificar f_vinc
      const vincVal = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_vinc"]') as HTMLInputElement)?.value || null);
      console.log(`   f_vinc = "${vincVal}"`);

      // 3. Campos
      const fields: [string, string][] = [
        ['f_enqua', v.enquadramento],
        ['f_carga', v.cargaHoraria],
        ['f_mes_ini', v.mesInicio],
        ['f_ano_ini', v.anoInicio],
      ];
      if (v.mesFim) fields.push(['f_mes_fim', v.mesFim]);
      if (v.anoFim) fields.push(['f_ano_fim', v.anoFim]);
      for (const [name, value] of fields) await fillFast(formFrame, name, value);
      console.log('   ✅ Campos preenchidos');

      // 4. Status
      const radioVal = v.statusAtual ? 'S' : 'N';
      const radio = await formFrame.$(`input[name="f_status"][value="${radioVal}"]`);
      if (radio) {
        await radio.evaluate((el: HTMLInputElement) => {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('click', { bubbles: true }));
        });
      }
      console.log(`   ✅ Status: ${v.statusAtual ? 'Atual' : 'Anterior'}`);

      // 5. Descrição
      await fillFast(formFrame, 'f_outras_inf', v.descricao);

      // 6. Salvar
      console.log('   💾 Salvando...');
      const saveResult = await nav.confirmAndSave(formFrame);
      if (saveResult.success) {
        console.log('   ✅✅ SALVO!');
        success++;
      } else {
        console.log(`   ❌ ${saveResult.error}`);
        const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
        if (confirmBtn) await confirmBtn.click();
        failed++;
      }

    } catch (e) {
      console.log(`   ❌ Erro: ${(e as Error).message}`);
      failed++;
    }

    await nav.closeModal();
    await page.waitForTimeout(1500);
  }

  console.log(`\n📊 Resultado: ${success} salvo(s), ${failed} falha(s)`);

  const listResult = await nav.readModuleList();
  if (listResult.success) {
    const records = listResult.data?.records || [];
    console.log(`\n📋 Lista final (${records.length}):`);
    for (const rec of records) console.log(`   • ${rec.text.substring(0, 120)}`);
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
