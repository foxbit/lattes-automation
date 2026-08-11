/**
 * DIAGNÓSTICO: form de Formação complementar — mapear campos
 * Uso: npx tsx src/diag-complementar.ts
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
        && (url.includes('.form') || url.includes('FORMACAO_COMPL') || url.includes('formacao_compl'))) {
        return f;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG: form Formação complementar\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação complementar');
  await page.waitForTimeout(5000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao_compl')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  console.log(`✅ Lista: ${listFrame.url()}`);
  
  // Ler lista existente
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`   Registros: ${listState.data.records.length}`);
    for (const r of listState.data.records) console.log(`   • ${r.text.substring(0, 100)}`);
  }
  
  // Abrir novo
  await nav.clickNewRecord(listFrame);
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // Mapear campos
  const map = await formFrame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      tag: el.tagName,
      name: (el as HTMLInputElement).name || '(sem nome)',
      type: (el as HTMLInputElement).type || 'select',
      id: el.id,
      value: ((el as HTMLInputElement).value || '').substring(0, 50),
      visible: !!(el as HTMLElement).offsetParent,
      disabled: (el as HTMLInputElement).disabled,
      readonly: (el as HTMLInputElement).readOnly,
    }));
    const radioGroups: Record<string, string[]> = {};
    document.querySelectorAll('input[type="radio"]').forEach(r => {
      const n = (r as HTMLInputElement).name;
      if (!radioGroups[n]) radioGroups[n] = [];
      radioGroups[n].push((r as HTMLInputElement).value);
    });
    const selects: Record<string, string[]> = {};
    document.querySelectorAll('select').forEach(s => {
      const n = (s as HTMLSelectElement).name || '(sem nome)';
      selects[n] = Array.from((s as HTMLSelectElement).options).map(o => `${o.value}=${o.textContent?.trim()}`);
    });
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: (a.textContent || '').trim().substring(0, 60),
      onclick: a.getAttribute('onclick'),
      className: a.className,
    })).filter(x => x.text || x.onclick);
    const labels = Array.from(document.querySelectorAll('label, td, font b')).map(l => 
      (l.textContent || '').trim().substring(0, 60)).filter(t => t.length > 2 && t.length < 60);
    return { inputs, radioGroups, selects, links, labels: [...new Set(labels)].slice(0, 50) };
  });
  
  console.log('\n📋 INPUTS:');
  for (const i of map.inputs) {
    console.log(`   <${i.tag}> name="${i.name}" type="${i.type}" id="${i.id}" value="${i.value}" vis=${i.visible} dis=${i.disabled} ro=${i.readonly}`);
  }
  console.log('\n📻 RADIOS:', JSON.stringify(map.radioGroups, null, 2));
  console.log('\n📑 SELECTS:', JSON.stringify(map.selects, null, 2));
  console.log('\n🔗 LINKS:');
  for (const l of map.links) console.log(`   "${l.text}" onclick="${l.onclick}" class="${l.className}"`);
  console.log('\n🏷️ LABELS:');
  for (const l of map.labels) console.log(`   • ${l}`);
  
  await nav.takeSnapshot('diag_complementar');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
