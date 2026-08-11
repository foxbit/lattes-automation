/**
 * DIAGNÓSTICO: form atuação após dominio() "Outro (especifique)" — valores reais
 * Uso: npx tsx src/diag-vinculo.ts
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

async function main() {
  console.log('🔬 DIAG: vínculo "Outro (especifique)"\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Handler de dialog
  page.on('dialog', async (dialog) => {
    console.log(`   💬 Dialog: ${dialog.type()} — ${dialog.message().substring(0, 80)}`);
    try { await dialog.accept('Sócio'); } catch { /* ignore */ }
  });
  
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Atuação profissional');
  await page.waitForTimeout(5000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_ativ')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  await nav.clickNewRecord();
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  
  // Selecionar instituição (Pipa — já cadastrada)
  console.log('🏫 Pipa...');
  await nav.fillLupa('f_inst', 'Pipa Produções', formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`   f_inst = "${instVal}"`);
  
  // dominio() com "Outro (especifique)"
  console.log('\n🔗 dominio() "Outro (especifique)"...');
  await nav.fillLupa('f_vinc', 'Outro (especifique)', formFrame);
  await page.waitForTimeout(2000);
  
  // Mapear TODOS os campos e valores APÓS dominio
  const map = await formFrame.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      tag: el.tagName,
      name: (el as HTMLInputElement).name || '(sem nome)',
      type: (el as HTMLInputElement).type || 'select',
      value: ((el as HTMLInputElement).value || '').substring(0, 60),
      visible: !!(el as HTMLElement).offsetParent,
      disabled: (el as HTMLInputElement).disabled,
    }));
    // Texto visível do form (labels)
    const labels = Array.from(document.querySelectorAll('td, label, font')).map(l =>
      (l.textContent || '').trim().substring(0, 60)).filter(t => t.length > 2 && t.length < 60);
    return { inputs, labels: [...new Set(labels)].slice(0, 40) };
  });
  
  console.log('\n📋 Inputs após dominio():');
  for (const i of map.inputs) {
    console.log(`   <${i.tag}> name="${i.name}" type="${i.type}" value="${i.value}" vis=${i.visible} dis=${i.disabled}`);
  }
  console.log('\n🏷️ Labels:', JSON.stringify(map.labels, null, 2));
  
  // Verificar se algum campo de texto para "outro" apareceu
  const outroField = await formFrame.evaluate(() => {
    // procurar input visível novo (não-hidden) que não existia antes
    const vis = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea')).filter(el => !!(el as HTMLElement).offsetParent);
    return vis.map(el => ({
      name: (el as HTMLInputElement).name || '',
      value: ((el as HTMLInputElement).value || '').substring(0, 40),
      placeholder: (el as HTMLInputElement).placeholder || '',
    }));
  });
  console.log('\n📋 Inputs visíveis:', JSON.stringify(outroField, null, 2));
  
  await nav.takeSnapshot('diag_vinculo');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
