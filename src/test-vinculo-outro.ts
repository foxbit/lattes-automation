/**
 * TESTE: vínculo "Outro" — sele("Outro") + digitação manual
 * Uso: npx tsx src/test-vinculo-outro.ts
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
  console.log('🧪 TESTE: vínculo "Outro" via sele("Outro") + manual\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
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
  
  // Instituição Pipa
  console.log('🏫 Pipa...');
  await nav.fillLupa('f_inst', 'Pipa Produções', formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`   f_inst = "${instVal}"`);
  
  // Abrir combo dominio (caixaMsg) e chamar sele("Outro")
  console.log('\n🔗 sele("Outro")...');
  await formFrame.evaluate(() => {
    const fn = (window as any).sele;
    if (fn) fn('Outro');
  });
  await page.waitForTimeout(1500);
  
  // Verificar estado do f_vinc (deve estar habilitado e vazio)
  const estado = await formFrame.evaluate(() => {
    const vinc = document.querySelector('input[name="f_vinc"]') as HTMLInputElement;
    return { value: vinc?.value, disabled: vinc?.disabled };
  });
  console.log(`   f_vinc após sele("Outro"): value="${estado.value}" disabled=${estado.disabled}`);
  
  // Digitar o tipo manualmente
  await fillFast(formFrame, 'f_vinc', 'Sócio');
  const vincVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_vinc"]') as HTMLInputElement)?.value || null);
  console.log(`   f_vinc = "${vincVal}"`);
  
  // Verificar f_stavinc (Possui vínculo)
  const stavincSel = await formFrame.$('select[name="f_stavinc"]');
  if (stavincSel) {
    await stavincSel.evaluate((el: HTMLSelectElement) => {
      el.value = '1';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const v = await formFrame.evaluate(() =>
      (document.querySelector('select[name="f_stavinc"]') as HTMLSelectElement)?.value || null);
    console.log(`   f_stavinc = "${v}"`);
  }
  
  // Outros campos
  await fillFast(formFrame, 'f_enqua', 'Diretor de Arte / Fundador');
  await fillFast(formFrame, 'f_carga', '40');
  await fillFast(formFrame, 'f_mes_ini', '01');
  await fillFast(formFrame, 'f_ano_ini', '2012');
  await fillFast(formFrame, 'f_mes_fim', '12');
  await fillFast(formFrame, 'f_ano_fim', '2015');
  
  // Status N (anterior)
  const radio = await formFrame.$('input[name="f_status"][value="N"]');
  if (radio) {
    await radio.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    });
  }
  
  await fillFast(formFrame, 'f_outras_inf', 'Fundou e atuou como Diretor de Arte da Agência Pipa, agência pioneira de publicidade digital no Maranhão, atendendo mais de 30 clientes ao longo de quatro anos.');
  
  // Salvar
  await nav.takeSnapshot('test_outro_pre');
  console.log('\n💾 Salvando...');
  const saveResult = await nav.confirmAndSave(formFrame);
  console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);
  
  // Verificar se modal fechou
  await page.waitForTimeout(2000);
  const stillOpen = await page.frames().some(f => f.url().includes('PKG_ATIV.inclui'));
  console.log(`   Form ainda aberto? ${stillOpen}`);
  
  if (!saveResult.success || stillOpen) {
    const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
    if (confirmBtn) await confirmBtn.click();
  }
  
  await nav.takeSnapshot('test_outro_post');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
