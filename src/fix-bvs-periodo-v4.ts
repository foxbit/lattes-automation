/**
 * Edita Builders Venture Studio — preenche período (out 2023 - fev 2025)
 * v4: NENHUMA função declarada dentro do evaluate (evita __name do esbuild)
 * 
 * Uso: npx tsx src/fix-bvs-periodo-v4.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function findFormFrame(page: Page, wantUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes(wantUrl)) return f;
    }
  }
  return null;
}

async function setInput(frame: Frame, name: string, value: string): Promise<void> {
  // Sem function declaration — arrow pura
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
  console.log(`🛠️ Fix período BVS v4 (out 2023 - fev 2025)\n`);

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

  // Clicar na linha TR da BVS
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

  const formFrame = await findFormFrame(page, 'cargos_vinculos');
  if (!formFrame) { console.log('❌ Form não abriu'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  // Mapear campos atuais — IIFE pura, sem declaração
  const before = await formFrame.evaluate(() => {
    const result: Record<string, { value: string | null; visible: boolean }> = {};
    const names = ['f_inst', 'f_vinc', 'f_enqua', 'f_mes_ini', 'f_ano_ini', 'f_mes_fim', 'f_ano_fim'];
    for (let i = 0; i < names.length; i++) {
      const el = document.querySelector('input[name="' + names[i] + '"]') as HTMLInputElement;
      result[names[i]] = el ? { value: el.value, visible: !!el.offsetParent } : { value: null, visible: false };
    }
    return result;
  });
  console.log('\n📋 Antes:', JSON.stringify(before, null, 2));

  // Clicar "Anterior" (f_status=N)
  console.log('\n🔘 Clicando "Anterior"...');
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
    console.log('   ⚠️ Radio N não encontrado direto — mapeando radios');
    const radios = await formFrame.evaluate(() => {
      const result: Array<{ value: string; checked: boolean; label: string }> = [];
      const els = document.querySelectorAll('input[name="f_status"]');
      for (let i = 0; i < els.length; i++) {
        const r = els[i] as HTMLInputElement;
        let label = '';
        const parent = r.parentElement;
        if (parent) label = (parent.textContent || '').trim().substring(0, 40);
        result.push({ value: r.value, checked: r.checked, label });
      }
      return result;
    });
    console.log('   Radios:', JSON.stringify(radios));
    // Clicar no radio cujo label contém "Anterior"
    await formFrame.evaluate(() => {
      const els = document.querySelectorAll('input[name="f_status"]');
      for (let i = 0; i < els.length; i++) {
        const r = els[i] as HTMLInputElement;
        let label = '';
        const parent = r.parentElement;
        if (parent) label = (parent.textContent || '').toLowerCase();
        if (label.indexOf('anterior') >= 0) {
          r.checked = true;
          r.dispatchEvent(new Event('change', { bubbles: true }));
          r.dispatchEvent(new Event('click', { bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(1500);
  }

  // Preencher período
  await setInput(formFrame, 'f_mes_ini', '10');
  await setInput(formFrame, 'f_ano_ini', '2023');
  await setInput(formFrame, 'f_mes_fim', '02');
  await setInput(formFrame, 'f_ano_fim', '2025');
  console.log('✅ Período preenchido');

  const after = await formFrame.evaluate(() => {
    const result: Record<string, { value: string | null; visible: boolean }> = {};
    const names = ['f_mes_ini', 'f_ano_ini', 'f_mes_fim', 'f_ano_fim'];
    for (let i = 0; i < names.length; i++) {
      const el = document.querySelector('input[name="' + names[i] + '"]') as HTMLInputElement;
      result[names[i]] = el ? { value: el.value, visible: !!el.offsetParent } : { value: null, visible: false };
    }
    return result;
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
