/**
 * Busca múltiplos nomes de instituição no Lattes
 * Uso: npx tsx src/search-institutions.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

const SEARCHES = [
  'FIAP',
  'Faculdade de Informatica e Administracao Paulista',
  'Faculdade FIAP',
  'UFPR',
  'Universidade Federal do Parana',
  'Estacio',
  'Faculdade Estacio',
  'Comunidade Sem Codar',
  'Meiuca',
  'PM3',
];

async function searchInstitution(page: any, formFrame: Frame, nav: LattesNavigator, term: string): Promise<string[]> {
  // Open institution search via sele_inst
  await formFrame.evaluate(() => {
    (window as any).sele_inst(1);
  });
  await page.waitForTimeout(3000);

  // Find CV3 frame
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }
  if (!cv3Frame) return ['❌ Frame não encontrado'];

  // Fill search
  const searchInput = await cv3Frame.$('input[name="f_nome"]');
  if (!searchInput) return ['❌ Input não encontrado'];
  
  await searchInput.fill(term);
  await page.waitForTimeout(500);

  // Click search
  await cv3Frame.evaluate(() => {
    const btns = document.querySelectorAll('a, input[type="submit"], input[type="button"], img');
    for (const btn of btns) {
      const src = (btn as HTMLImageElement).src || '';
      const alt = (btn as HTMLImageElement).alt || '';
      const value = (btn as HTMLInputElement).value || '';
      if (src.includes('pesquisar') || src.includes('search') || alt.includes('Pesquisar') || value.includes('Pesquisar')) {
        (btn as HTMLElement).click();
        return;
      }
    }
    // Try form submit
    const form = document.querySelector('form');
    if (form) form.submit();
  });
  await page.waitForTimeout(3000);

  // Read results
  const bodyText = await cv3Frame.textContent('body').catch(() => '');
  const results: string[] = [];
  
  // Find result rows
  const rows = await cv3Frame.$$('tr, .resultado, li, a[onclick*="select"]');
  for (const row of rows) {
    const text = await row.textContent().catch(() => '');
    if (text && text.trim().length > 2 && !text.includes('Pesquisar') && !text.includes('Nome da Instituição')) {
      results.push(text.trim().substring(0, 100));
    }
  }

  // Close CV3 - click Fechar or X
  const closeBtn = await cv3Frame.$('a:has-text("Fechar"), input[value="Fechar"], a[onclick*="fechar"]');
  if (closeBtn) await closeBtn.click();
  await page.waitForTimeout(1000);

  return results.length > 0 ? results : ['Nenhum resultado'];
}

async function main() {
  console.log('🔍 Buscando múltiplas instituições no CNPq\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate to formacao
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);
  
  // Get list frame and click "Incluir novo item"
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao.lista')) { listFrame = f; break; }
  }
  if (!listFrame) {
    console.error('❌ Lista não encontrada');
    await session.close();
    return;
  }

  // Click include
  await listFrame.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.textContent?.includes('Incluir')) {
        (link as HTMLElement).click();
        return;
      }
    }
  });
  await page.waitForTimeout(3000);

  // Select level
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao.form')) { formFrame = f; break; }
  }

  if (!formFrame) {
    // Maybe a level selector dialog appeared
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank' && !f.url().includes('pkg_formacao.lista')) {
        formFrame = f;
        break;
      }
    }
  }

  if (formFrame) {
    // Select Especialização
    try {
      await formFrame.selectOption('select[name="f_nivel"]', '2');
      await page.waitForTimeout(2000);
    } catch {}
  }

  if (!formFrame) {
    for (const f of page.frames()) {
      if (f.url().includes('pkg_formacao.form')) { formFrame = f; break; }
    }
  }

  if (!formFrame) {
    console.error('❌ Formulário não encontrado');
    await session.close();
    return;
  }

  for (const term of SEARCHES) {
    const results = await searchInstitution(page, formFrame, nav, term);
    console.log(`\n📌 "${term}":`);
    for (const r of results.slice(0, 5)) {
      console.log(`   ${r}`);
    }
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
