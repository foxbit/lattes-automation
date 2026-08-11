/**
 * Cadastra Leany Lean Ventures — vínculo PJ isolado
 * Uso: npx tsx src/populate-leany.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const V = {
  nomeInst: 'Leany Lean Ventures Ltda',
  busca: 'Leany Lean Ventures',
  vinculoTipo: 'Pessoa Jurídica',
  enquadramento: 'Lead Product Design',
  cargaHoraria: '40',
  mesInicio: '03', anoInicio: '2025',
  statusAtual: true,
  descricao: 'Lidera a estratégia de design e experiência do usuário na Leany, desenvolvendo soluções com No-Code, AI-Code e Automação para plataformas SaaS, Web3, fintech, e-commerce e healthtech.',
};

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

async function main() {
  console.log(`🏢 Leany Lean Ventures Ltda\n`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  await nav.openMenu('Atuação');
  await page.waitForTimeout(3000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(6000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }

  await nav.clickNewRecord();
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  try {
    // 1. Instituição — com mais espera
    console.log('🔍 Lupa instituição...');
    await formFrame.evaluate(() => {
      const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
      if (el) el.click();
    });
    await page.waitForTimeout(5000);

    let cv3Frame: Frame | null = null;
    for (const f of page.frames()) {
      if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
    }
    if (!cv3Frame) { console.log('❌ ModalCV3 não abriu'); await session.close(); return; }
    console.log(`✅ CV3: ${cv3Frame.url()}`);

    console.log(`🔎 Buscando "${V.busca}"...`);
    await cv3Frame.evaluate((term: string) => {
      const inp = document.querySelector('input[name="f_nome"]') as HTMLInputElement;
      if (inp) {
        inp.value = term;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const form = document.querySelector('form[name="instituicaoForm"]');
      if (form) (form as HTMLFormElement).submit();
    }, V.busca);
    await page.waitForTimeout(6000);

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
    }, V.busca);

    if (!clicked.clicked) { console.log('❌ Instituição não encontrada'); await session.close(); return; }
    console.log(`✅ Selecionado: ${clicked.text}`);
    await clearOverlays(page);

    const instVal = await formFrame.evaluate(() =>
      (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
    console.log(`🏫 f_inst = "${instVal}"`);
    if (!instVal) { console.log('❌ Instituição vazia'); await session.close(); return; }

    // 2. Vínculo "Outro" corrigido
    console.log('🔗 sele("Outro") + texto manual...');
    await formFrame.evaluate(() => {
      const fn = (window as any).sele;
      if (fn) fn('Outro');
    });
    await page.waitForTimeout(2000);
    await fillFast(formFrame, 'f_vinc', V.vinculoTipo);
    const vincVal = await formFrame.evaluate(() =>
      (document.querySelector('input[name="f_vinc"]') as HTMLInputElement)?.value || null);
    console.log(`   f_vinc = "${vincVal}"`);

    // 3. Campos
    const fields: [string, string][] = [
      ['f_enqua', V.enquadramento],
      ['f_carga', V.cargaHoraria],
      ['f_mes_ini', V.mesInicio],
      ['f_ano_ini', V.anoInicio],
    ];
    for (const [name, value] of fields) await fillFast(formFrame, name, value);
    console.log('✅ Campos preenchidos');

    // 4. Status Atual
    const radio = await formFrame.$('input[name="f_status"][value="S"]');
    if (radio) {
      await radio.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('click', { bubbles: true }));
      });
    }
    console.log('✅ Status: Atual');

    // 5. Descrição
    await fillFast(formFrame, 'f_outras_inf', V.descricao);

    // 6. Salvar
    console.log('💾 Salvando...');
    const saveResult = await nav.confirmAndSave(formFrame);
    await page.waitForTimeout(2500);
    const stillOpen = await page.frames().some(f => f.url().includes('PKG_ATIV.inclui'));

    if (saveResult.success && !stillOpen) {
      console.log('✅✅ SALVO!');
    } else {
      console.log(`❌ ${saveResult.success ? 'form ainda aberto' : saveResult.error}`);
      const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
      if (confirmBtn) await confirmBtn.click();
    }

  } catch (e) {
    console.log(`❌ Erro: ${(e as Error).message}`);
  }

  await nav.closeModal();
  await page.waitForTimeout(2000);

  // Verificar lista
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
