/**
 * DIAGNÓSTICO: form de Aperfeiçoamento — mapear TODOS os campos
 * Uso: npx tsx src/diag-form-aperf.ts
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
        && (url.includes('.form') || url.includes('pkg_formacao'))) {
        return f;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG: form Aperfeiçoamento — campos completos\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  // Abrir Aperfeiçoamento
  const levelData = await listFrame.evaluate(() => {
    const fn = (window as any).selecionarNivel;
    if (!fn) return null;
    const source = fn.toString();
    const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
    const baseUrl = urlMatch ? urlMatch[1] : '';
    const result: Array<{ name: string; url: string }> = [];
    const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      result.push({ name: match[1], url: baseUrl + match[2] });
    }
    return result;
  });
  
  const aperf = levelData?.find(l => l.name.toLowerCase().includes('aperfeiçoamento'));
  if (!aperf) { console.log('❌ Aperfeiçoamento não encontrado'); await session.close(); return; }
  
  await listFrame.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, aperf.url);
  await page.waitForTimeout(5000);
  
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  console.log(`✅ Form: ${formFrame.url()}`);
  
  // Mapear inputs, selects, radios, textareas
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
      onclick: el.getAttribute('onclick')?.substring(0, 60),
    }));
    
    // Radios groups
    const radioGroups: Record<string, string[]> = {};
    document.querySelectorAll('input[type="radio"]').forEach(r => {
      const n = (r as HTMLInputElement).name;
      if (!radioGroups[n]) radioGroups[n] = [];
      radioGroups[n].push((r as HTMLInputElement).value);
    });
    
    // Selects options
    const selects: Record<string, string[]> = {};
    document.querySelectorAll('select').forEach(s => {
      const n = (s as HTMLSelectElement).name || '(sem nome)';
      selects[n] = Array.from((s as HTMLSelectElement).options).map(o => `${o.value}=${o.textContent?.trim()}`);
    });
    
    // Labels: text next to inputs
    const labels = Array.from(document.querySelectorAll('label, td')).map(l => 
      (l.textContent || '').trim().substring(0, 60)).filter(t => t.length > 2 && t.length < 60);
    
    return { inputs, radioGroups, selects, labels: [...new Set(labels)].slice(0, 60) };
  });
  
  console.log('\n📋 INPUTS:');
  for (const i of map.inputs) {
    console.log(`   <${i.tag}> name="${i.name}" type="${i.type}" id="${i.id}" value="${i.value}" vis=${i.visible} dis=${i.disabled} ro=${i.readonly} oc="${i.onclick || ''}"`);
  }
  
  console.log('\n📻 RADIO GROUPS:');
  for (const [name, vals] of Object.entries(map.radioGroups)) {
    console.log(`   ${name}: [${vals.join(', ')}]`);
  }
  
  console.log('\n📑 SELECTS:');
  for (const [name, opts] of Object.entries(map.selects)) {
    console.log(`   ${name}: [${opts.join(' | ')}]`);
  }
  
  console.log('\n🏷️ LABELS/TEXTOS:');
  for (const l of map.labels) console.log(`   • ${l}`);
  
  await nav.takeSnapshot('diag_form_aperf');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
