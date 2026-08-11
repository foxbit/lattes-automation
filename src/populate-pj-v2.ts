/**
 * Cadastra vínculos PJ (Platform Builders, Leany) — v4 com sele("Outro") corrigido
 * 
 * Fluxo correto para vínculo "Outro (especifique)":
 * 1. Abrir combo dominio() → ler options
 * 2. Chamar sele("Outro") [VALOR INTERNO, não texto exibido] → habilita f_vinc
 * 3. fillFast f_vinc com texto do tipo (ex: "Pessoa Jurídica")
 * 4. Preencher demais campos → Salvar → verificar form FECHOU
 * 
 * Uso: npx tsx src/populate-pj-v2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface Vinculo {
  nomeInst: string;
  sigla: string;
  uf: string;
  busca: string;
  vinculoTipo: string;   // texto digitado no f_vinc (ex: "Pessoa Jurídica")
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
    nomeInst: 'Platform Builders IT Solutions Ltda',
    sigla: 'PB',
    uf: 'SP',
    busca: 'Platform Builders IT Solutions',
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

async function clearOverlays(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, .win-overlay, .caixaMsg, .win-message').forEach(el => el.remove());
  }).catch(() => {});
  await page.waitForTimeout(300);
}

/** Seleciona instituição (já cadastrada) via lupa */
async function selectInstitution(page: Page, formFrame: Frame, v: Vinculo): Promise<boolean> {
  console.log('   🔍 Lupa instituição...');
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
  console.log('   ❌ Instituição não encontrada no CNPq');
  return false;
}

/** Preenche vínculo "Outro (especifique)" — sele("Outro") + texto manual */
async function fillVinculoOutro(formFrame: Frame, tipoTexto: string): Promise<boolean> {
  console.log('   🔗 Vínculo: Outro (especifique) → sele("Outro") + texto manual');
  await formFrame.evaluate(() => {
    const fn = (window as any).sele;
    if (fn) fn('Outro');
  });
  await page2.waitForTimeout(1500);
  await fillFast(formFrame, 'f_vinc', tipoTexto);
  const val = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_vinc"]') as HTMLInputElement)?.value || null);
  console.log(`   f_vinc = "${val}"`);
  return !!val;
}

let page2: Page;

async function main() {
  console.log('🏢 PJ v2: Platform Builders + Leany\n');

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  page2 = page;
  const nav = new LattesNavigator(page);

  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }

  let success = 0;
  let failed = 0;

  for (const v of VINCULOS) {
    console.log(`\n📌 ${v.enquadramento} @ ${v.nomeInst}`);

    await nav.clickNewRecord();
    const formFrame = await findFormFrame(page, listFrame.url());
    if (!formFrame) { console.log('   ❌ Form'); failed++; continue; }

    try {
      // 1. Instituição
      const instOk = await selectInstitution(page, formFrame, v);
      if (!instOk) { console.log('   ❌ Falha instituição'); failed++; await nav.closeModal(); await page.waitForTimeout(1000); continue; }

      const instVal = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
      console.log(`   🏫 f_inst = "${instVal}"`);
      if (!instVal) { console.log('   ❌ Instituição vazia'); failed++; await nav.closeModal(); await page.waitForTimeout(1000); continue; }

      // 2. Vínculo "Outro" corrigido
      await fillVinculoOutro(formFrame, v.vinculoTipo);

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

      // 6. Salvar + verificar form fechou
      console.log('   💾 Salvando...');
      const saveResult = await nav.confirmAndSave(formFrame);
      await page.waitForTimeout(2000);
      const stillOpen = await page.frames().some(f => f.url().includes('PKG_ATIV.inclui'));

      if (saveResult.success && !stillOpen) {
        console.log('   ✅✅ SALVO!');
        success++;
      } else {
        console.log(`   ❌ ${saveResult.success ? 'form ainda aberto' : saveResult.error}`);
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

  // Verificar lista final
  await nav.closeModal();
  await page.waitForTimeout(1500);
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(6000);

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
