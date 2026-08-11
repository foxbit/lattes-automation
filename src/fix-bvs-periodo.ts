/**
 * Edita Builders Venture Studio — preenche período (out 2023 - fev 2025)
 * 
 * O registro foi salvo sem período porque os campos de fim estavam ocultos.
 * Fluxo: abrir registro → clicar "Anterior" (f_status=N) → revela fim → preencher → salvar
 * 
 * Uso: npx tsx src/fix-bvs-periodo.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

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

async function main() {
  console.log(`🛠️ Fix período BVS (out 2023 - fev 2025)\n`);

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

  // Encontrar o link de edição do registro BVS (6º registro)
  console.log('🔍 Buscando registro BVS para editar...');
  const editInfo = await listFrame.evaluate(() => {
    // Os registros têm links de edição — procurar pela linha que contém "Builders"
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      const text = (row.textContent || '').toLowerCase();
      if (text.includes('builders venture')) {
        // Procurar link de edição dentro da linha
        const links = Array.from(row.querySelectorAll('a'));
        for (const link of links) {
          const onclick = link.getAttribute('onclick') || '';
          const href = link.getAttribute('href') || '';
          if (onclick.includes('editar') || onclick.includes('edit') || href.includes('edit')) {
            return { found: true, onclick: onclick.substring(0, 200), href, text: (link.textContent || '').trim() };
          }
        }
        // Fallback: pegar todos os links da linha
        return { found: true, onclick: links.map(l => `${l.getAttribute('onclick')?.substring(0, 80) || ''}`).join(' | '), text: (row.textContent || '').trim().substring(0, 200) };
      }
    }
    return { found: false };
  });
  console.log('   Edit info:', JSON.stringify(editInfo, null, 2));

  // Clicar na linha TR que contém "Builders Venture" E tem onclick de edição
  const clicked = await listFrame.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr'));
    for (const row of rows) {
      const text = (row.textContent || '').toLowerCase();
      const oc = row.getAttribute('onclick') || '';
      if (text.includes('builders venture') && oc.includes('setarUrl')) {
        (row as HTMLElement).click();
        return { clicked: true, oc: oc.substring(0, 150) };
      }
    }
    return { clicked: false };
  });
  console.log('   Click:', JSON.stringify(clicked));
  await page.waitForTimeout(5000);

  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form não abriu'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  // Mapear campos atuais
  const before = await formFrame.evaluate(() => {
    const get = (n: string) => {
      const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
      return el ? { value: el.value, visible: !!el.offsetParent, disabled: el.disabled } : null;
    };
    return {
      f_inst: get('f_inst'), f_vinc: get('f_vinc'), f_enqua: get('f_enqua'),
      f_mes_ini: get('f_mes_ini'), f_ano_ini: get('f_ano_ini'),
      f_mes_fim: get('f_mes_fim'), f_ano_fim: get('f_ano_fim'),
      f_status: get('f_status'),
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
    await page.waitForTimeout(1000);
  }

  // Preencher período
  await fillFast(formFrame, 'f_mes_ini', '10');
  await fillFast(formFrame, 'f_ano_ini', '2023');
  await fillFast(formFrame, 'f_mes_fim', '02');
  await fillFast(formFrame, 'f_ano_fim', '2025');
  console.log('✅ Período preenchido');

  const after = await formFrame.evaluate(() => {
    const get = (n: string) => {
      const el = document.querySelector(`input[name="${n}"]`) as HTMLInputElement;
      return el ? { value: el.value, visible: !!el.offsetParent } : null;
    };
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
  const stillOpen = await page.frames().some(f => f.url().includes('PKG_ATIV.inclui') || f.url().includes('PKG_ATIV.altera'));

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
