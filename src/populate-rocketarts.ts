/**
 * Cadastra RocketArts (Digital A2B Tecnologia da Informação Ltda) — vínculo PJ
 * 
 * Dados validados (material 5.3):
 * - CNPJ: 37.040.424/0001-90 (informado pelo Angelo — o Lattes não pede CNPJ no cadastro)
 * - Razão social: Digital A2B Tecnologia da Informação Ltda
 * - Vínculo: Sócio/Administrador → "Outro (especifique)" + texto "Sócio"
 * - Enquadramento: Founder / Product Designer Leader
 * - Período: Jan 2019 - Dez 2021
 * 
 * Uso: npx tsx src/populate-rocketarts.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const V = {
  nomeInst: 'Digital A2B Tecnologia da Informação Ltda',
  sigla: 'RA',
  uf: 'SP',
  busca: 'Digital A2B Tecnologia',
  vinculoTipo: 'Sócio',
  enquadramento: 'Founder / Product Designer Leader',
  cargaHoraria: '40',
  mesInicio: '01', anoInicio: '2019',
  mesFim: '12', anoFim: '2021',
  statusAtual: false,
  descricao: 'Fundou a RocketArts, startup digital de serviços de conteúdo por assinatura para diversos setores profissionais (dentistas, médicos, engenheiros, nutricionistas). Utilizando automação e IA, entregava pacotes semanais de conteúdo personalizado com a marca do cliente, prontos para distribuição em redes sociais. Ao longo de quatro anos, alcançou mais de 1.000 assinantes em todo o Brasil. Responsabilidades incluíam definição de MVP, design de personas, criação de modelo de negócio, workshops de Design Thinking, prototipagem e gestão de backlog baseada em discovery contínuo.',
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

/** Registra instituição via "Cadastrar nova instituição" OU seleciona se existir */
async function registerOrSelectInstitution(page: Page, formFrame: Frame, v: typeof V): Promise<boolean> {
  console.log('   🔍 Lupa instituição...');
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="sele_inst"]') as HTMLElement;
    if (el) el.click();
  });
  await page.waitForTimeout(5000);

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
  await page.waitForTimeout(6000);

  // Verificar se já existe no CNPq
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

  // Cadastrar nova
  console.log('   🆕 Cadastrando nova instituição...');
  await clearOverlays(page);
  const cadastrarLink = await cv3Frame.$('a:has-text("Cadastrar nova instituição"), a:has-text("cadastrar nova")');
  if (!cadastrarLink) { console.log('   ❌ Link Cadastrar não encontrado'); return false; }
  await cadastrarLink.click({ force: true }).catch(async () => {
    await cadastrarLink.evaluate((el: HTMLElement) => el.click());
  });
  await page.waitForTimeout(4000);

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

  // Fechar caixaMsg
  const msgConfirm = await page.$('input[value="Confirmar"]');
  if (msgConfirm) {
    const inCaixa = await msgConfirm.evaluate((el) => {
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        if (p.className && (p.className as string).includes('caixaMsg')) return true;
        p = p.parentElement;
      }
      return false;
    });
    if (inCaixa) {
      console.log('   ⚠️ CaixaMsg — Confirmar');
      await msgConfirm.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }
  await clearOverlays(page);
  console.log('   ✅ Cadastro confirmado');
  return true;
}

async function main() {
  console.log(`🏢 RocketArts (Digital A2B) — vínculo Sócio\n`);

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
    // 1. Instituição (cadastra se não existir)
    const instOk = await registerOrSelectInstitution(page, formFrame, V);
    if (!instOk) { console.log('❌ Falha instituição'); await session.close(); return; }

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
      ['f_mes_fim', V.mesFim!],
      ['f_ano_fim', V.anoFim!],
    ];
    for (const [name, value] of fields) await fillFast(formFrame, name, value);
    console.log('✅ Campos preenchidos');

    // 4. Status Anterior
    const radio = await formFrame.$('input[name="f_status"][value="N"]');
    if (radio) {
      await radio.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('click', { bubbles: true }));
      });
    }
    console.log('✅ Status: Anterior');

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
