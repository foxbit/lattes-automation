/**
 * DIAGNÓSTICO: estrutura do form de EDIÇÃO (PKG_ATIV.cargos_vinculos)
 * Uso: npx tsx src/diag-cargos.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function findFormFrame(page: any, wantUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      if (f.url().includes(wantUrl)) return f;
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG: form edição cargos_vinculos\n');

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

  // Clicar linha BVS
  console.log('🔍 Clicando linha BVS...');
  await listFrame.evaluate(() => {
    const rows = document.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      const text = (row.textContent || '').toLowerCase();
      const oc = row.getAttribute('onclick') || '';
      if (text.indexOf('builders venture') >= 0 && oc.indexOf('setarUrl') >= 0) {
        row.click();
      }
    }
  });
  await page.waitForTimeout(5000);

  const formFrame = await findFormFrame(page, 'cargos_vinculos');
  if (!formFrame) { console.log('❌ Form não abriu'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);

  // Mapear inputs do form de edição
  const inputs = await formFrame.evaluate(() => {
    const result: Array<{ tag: string; name: string; type: string; value: string; visible: boolean; disabled: boolean }> = [];
    const els = document.querySelectorAll('input, select, textarea');
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLInputElement;
      const name = el.getAttribute('name') || '(sem nome)';
      if (name !== '(sem nome)' || el.type !== 'hidden') {
        result.push({
          tag: el.tagName,
          name,
          type: el.type || 'select',
          value: (el.value || '').substring(0, 50),
          visible: !!el.offsetParent,
          disabled: el.disabled,
        });
      }
    }
    return result;
  });
  console.log(`\n📋 Inputs (${inputs.length}):`);
  for (const i of inputs) {
    console.log(`   <${i.tag}> name="${i.name}" type="${i.type}" value="${i.value}" vis=${i.visible} dis=${i.disabled}`);
  }

  // Botões/links de ação
  const actions = await formFrame.evaluate(() => {
    const result: Array<{ tag: string; text: string; onclick: string; cls: string }> = [];
    const els = document.querySelectorAll('a, input[type="button"], input[type="submit"], button');
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLElement;
      const oc = el.getAttribute('onclick') || '';
      if (oc || el.tagName === 'BUTTON' || (el as HTMLInputElement).type === 'button') {
        result.push({
          tag: el.tagName,
          text: ((el.textContent || (el as HTMLInputElement).value) || '').trim().substring(0, 40),
          onclick: oc.substring(0, 100),
          cls: el.getAttribute('class') || '',
        });
      }
    }
    return result;
  });
  console.log(`\n🎯 Ações (${actions.length}):`);
  for (const a of actions) {
    console.log(`   <${a.tag} class="${a.cls}"> text="${a.text}" onclick="${a.onclick}"`);
  }

  // Labels visíveis
  const labels = await formFrame.evaluate(() => {
    const result: string[] = [];
    const els = document.querySelectorAll('td, label, font, span');
    for (let i = 0; i < els.length; i++) {
      const t = (els[i].textContent || '').trim();
      if (t.length > 2 && t.length < 60) result.push(t);
    }
    return Array.from(new Set(result)).slice(0, 50);
  });
  console.log(`\n🏷️ Labels:`);
  console.log(JSON.stringify(labels, null, 2));

  await nav.takeSnapshot('diag_cargos');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
