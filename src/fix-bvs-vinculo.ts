/**
 * Fix Builders Venture Studio — cria vínculo interno com período
 * 
 * FLUXO (descoberto no diag):
 * 1. Lista → clicar linha BVS → cargos_vinculos (vínculos da instituição)
 * 2. "Incluir novo item" → PKG_ATIV.vinculos (form interno)
 * 3. dominio() → sele("Outro") → digitar "Pessoa Jurídica"
 * 4. f_enqua, f_carga, f_mes_ini, f_ano_ini
 * 5. Radio "Anterior" (f_status=N) → REVELA f_mes_fim/f_ano_fim
 * 6. f_mes_fim, f_ano_fim, f_outras_inf
 * 7. Salvar (check())
 * 
 * Uso: npx tsx src/fix-bvs-vinculo.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

const DADOS = {
  vinculoTipo: 'Pessoa Jurídica',
  enquadramento: 'UX Design Lead / Head of Experimentation',
  cargaHoraria: '40',
  mesInicio: '10', anoInicio: '2023',
  mesFim: '02', anoFim: '2025',
  descricao: 'Prototipagem e condução de experimentos para testar e validar ideias, produtos e conceitos. Utilização de metodologias de design e abordagens científicas para desenvolver protótipos tangíveis testados em ambientes controlados ou reais. Geração de conceitos de serviço por meio de prototipagem para apresentação, validação e teste com usuários. Colaboração com stakeholders, designers e consultores para criação de serviços multicanal.',
};

async function findFrame(page: any, wantUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes(wantUrl)) return f;
    }
  }
  return null;
}

async function setInput(frame: Frame, name: string, value: string): Promise<void> {
  await frame.evaluate((args: { name: string; value: string }) => {
    const el = document.querySelector('input[name="' + args.name + '"]') as HTMLInputElement;
    if (!el) return;
    el.removeAttribute('disabled');
    el.value = args.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { name, value });
}

async function main() {
  console.log(`🛠️ Fix BVS vínculo interno (out 2023 - fev 2025)\n`);

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

  // 1. Clicar linha BVS
  console.log('🔍 Clicando linha BVS...');
  const clicked = await listFrame.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      const text = (row.textContent || '').toLowerCase();
      const oc = row.getAttribute('onclick') || '';
      if (text.indexOf('builders venture') >= 0 && oc.indexOf('setarUrl') >= 0) {
        row.click();
        return true;
      }
    }
    return false;
  });
  if (!clicked) { console.log('❌ Linha BVS não encontrada'); await session.close(); return; }
  await page.waitForTimeout(5000);

  // 2. Abrir form de vínculo interno
  const cargosFrame = await findFrame(page, 'cargos_vinculos');
  if (!cargosFrame) { console.log('❌ cargos_vinculos não abriu'); await session.close(); return; }
  console.log(`✅ cargos_vinculos: ${cargosFrame.url()}`);

  // Verificar se já há vínculo cadastrado
  const existing = await cargosFrame.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const t = (rows[i].textContent || '').toLowerCase();
      if (t.indexOf('pessoa juridica') >= 0 || t.indexOf('vinculo') >= 0) return t.trim().substring(0, 100);
    }
    return '';
  });
  console.log(`   Registro existente? "${existing}"`);

  console.log('🔍 Clicando "Incluir novo item"...');
  await cargosFrame.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (let i = 0; i < links.length; i++) {
      const oc = links[i].getAttribute('onclick') || '';
      if (oc.indexOf('PKG_ATIV.vinculos') >= 0) {
        (links[i] as HTMLElement).click();
      }
    }
  });
  await page.waitForTimeout(5000);

  const formFrame = await findFrame(page, 'PKG_ATIV.vinculos');
  if (!formFrame) { console.log('❌ vinculos não abriu'); await session.close(); return; }
  console.log(`✅ vinculos: ${formFrame.url()}`);

  // 3. Vínculo "Outro" → sele("Outro") + texto
  console.log('🔗 sele("Outro") + texto manual...');
  await formFrame.evaluate(() => {
    const fn = (window as any).sele;
    if (fn) fn('Outro');
  });
  await page.waitForTimeout(2000);
  await setInput(formFrame, 'f_vinc', DADOS.vinculoTipo);
  const vincVal = await formFrame.evaluate(() => {
    const el = document.querySelector('input[name="f_vinc"]') as HTMLInputElement;
    return el ? el.value : null;
  });
  console.log(`   f_vinc = "${vincVal}"`);

  // 4. Campos básicos
  await setInput(formFrame, 'f_enqua', DADOS.enquadramento);
  await setInput(formFrame, 'f_carga', DADOS.cargaHoraria);
  await setInput(formFrame, 'f_mes_ini', DADOS.mesInicio);
  await setInput(formFrame, 'f_ano_ini', DADOS.anoInicio);
  console.log('✅ Campos básicos preenchidos');

  // 5. Radio "Anterior" (N) — ANTES do fim
  console.log('🔘 Radio "Anterior"...');
  const radioN = await formFrame.$('input[name="f_status"][value="N"]');
  if (radioN) {
    await radioN.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
    console.log('   ✅ Radio N clicado');
  } else {
    console.log('   ⚠️ Radio N não encontrado');
  }

  // 6. Fim (agora visível após "Anterior")
  await setInput(formFrame, 'f_mes_fim', DADOS.mesFim);
  await setInput(formFrame, 'f_ano_fim', DADOS.anoFim);
  await setInput(formFrame, 'f_outras_inf', DADOS.descricao);
  console.log('✅ Fim + descrição preenchidos');

  // Verificar estado
  const after = await formFrame.evaluate(() => {
    const result: Record<string, string | null> = {};
    const names = ['f_vinc', 'f_enqua', 'f_mes_ini', 'f_ano_ini', 'f_mes_fim', 'f_ano_fim'];
    for (let i = 0; i < names.length; i++) {
      const el = document.querySelector('input[name="' + names[i] + '"]') as HTMLInputElement;
      result[names[i]] = el ? el.value : null;
    }
    return result;
  });
  console.log('\n📋 Estado:', JSON.stringify(after, null, 2));

  // 7. Salvar
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  await page.waitForTimeout(2500);
  const stillOpen = await page.frames().some((f) => f.url().includes('PKG_ATIV.vinculos'));

  if (saveResult.success && !stillOpen) {
    console.log('✅✅ SALVO!');
  } else {
    console.log(`❌ ${saveResult.success ? 'form ainda aberto' : saveResult.error}`);
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
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
    for (const rec of records) console.log(`   • ${rec.text.substring(0, 130)}`);
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
