/**
 * Edita Builders Venture Studio — preenche período (out 2023 - fev 2025)
 * v3: sem arrow functions aninhadas no evaluate (evita erro tsx __name)
 * 
 * Uso: npx tsx src/fix-bvs-periodo-v3.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function findFormFrame(page: Page, listUrl: string, wantUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      const url = f.url();
      if (url.includes(wantUrl)) return f;
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
  console.log(`🛠️ Fix período BVS v3 (out 2023 - fev 2025)\n`);

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

  // Clicar na linha TR da BVS (com onclick setarUrl)
  console.log('🔍 Clicando linha BVS...');
  const clicked = await listFrame.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      const text = (row.textContent || '').toLowerCase();
      const oc = row.getAttribute('onclick') || '';
      if (text.indexOf('builders venture') >= 0 && oc.indexOf('setarUrl') >= 0) {
        row.click();
        return oc.substring(0, 150);
      }
    }
    return '';
  });
  console.log('   Click oc:', clicked);
  if (!clicked) { console.log('❌ Linha BVS não encontrada'); await session.close(); return; }

  // Aguardar form cargos_vinculos
  const formFrame = await findFormFrame(page, listFrame.url(), 'cargos_vinculos');
  if (!formFrame) { console.log('❌ Form não abriu'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  // Mapear campos atuais (sem arrows)
  const before = await formFrame.evaluate(() => {
    function get(n: string) {
      const el = document.querySelector('input[name="' + n + '"]') as HTMLInputElement;
      if (!el) return { value: null, visible: false, disabled: false };
      return { value: el.value, visible: !!el.offsetParent, disabled: el.disabled };
    }
    return {
      f_inst: get('f_inst'), f_vinc: get('f_vinc'), f_enqua: get('f_enqua'),
      f_mes_ini: get('f_mes_ini'), f_ano_ini: get('f_ano_ini'),
      f_mes_fim: get('f_mes_fim'), f_ano_fim: get('f_ano_fim'),
    };
  });
  console.log('\n📋 Antes:', JSON.stringify(before, null, 2));

  // Clicar "Anterior" (f_status=N) para revelar campos de fim
  console.log('\n🔘 Clicando "Anterior"...');
  const radioN = await formFrame.$('input[name="f_status"][value="N"]');
  if (radioN) {
    await radioN.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
    await page.waitForTimeout(1500);
  } else {
    console.log('   ⚠️ Radio "Anterior" não encontrado — tentando radio por texto');
    // Fallback: procurar radio visível perto do texto "Anterior"
    const radioByText = await formFrame.evaluate(() => {
      const radios = document.querySelectorAll('input[name="f_status"]');
      for (let i = 0; i < radios.length; i++) {
        const r = radios[i] as HTMLInputElement;
        let lbl = '';
        const parent = r.parentElement;
        if (parent) lbl = (parent.textContent || '').trim().toLowerCase();
        if (lbl.indexOf('anterior') >= 0) {
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          r.dispatchEvent(new Event('click', { bubbles: true }));
          return r.value;
        }
      }
      return '';
    });
    console.log('   Fallback radio:', radioByText);
    await page.waitForTimeout(1500);
  }

  // Preencher período
  await setInput(formFrame, 'f_mes_ini', '10');
  await setInput(formFrame, 'f_ano_ini', '2023');
  await setInput(formFrame, 'f_mes_fim', '02');
  await setInput(formFrame, 'f_ano_fim', '2025');
  console.log('✅ Período preenchido');

  const after = await formFrame.evaluate(() => {
    function get(n: string) {
      const el = document.querySelector('input[name="' + n + '"]') as HTMLInputElement;
      if (!el) return { value: null, visible: false };
      return { value: el.value, visible: !!el.offsetParent };
    }
    return {
      f_mes_ini: get('f_mes_ini'), f_ano_ini: get('f_ano_ini'),
      f_mes_fim: get('f_mes_fim'), f_ano_fim: get('f_ano_fim'),
    };
  });
  console.log('\n📋 Depois:', JSON.stringify(after, null, 2));

  // Salvar
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  await page.waitForTimeout(2500);
  const stillOpen = await page.frames().some((f) => f.url().includes('cargos_vinculos'));

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
