/**
 * Busca instituição no Lattes para verificar se existe
 * Uso: npx tsx src/search-institution.ts "FIAP"
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
  const searchTerm = process.argv[2] || 'FIAP';
  
  console.log(`🔍 Buscando instituição: "${searchTerm}"`);
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate to formacao
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);
  
  // Get list frame
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao.lista')) { listFrame = f; break; }
  }
  if (!listFrame) {
    console.error('❌ Lista não encontrada');
    await session.close();
    return;
  }
  
  // Click 'Incluir novo item'
  const btn = await listFrame.$('a.adicionar, a:has-text("Incluir novo item")');
  if (btn) { await btn.click(); await page.waitForTimeout(5000); }
  
  // Get form frame
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao.form')) { formFrame = f; break; }
  }
  if (!formFrame) {
    console.error('❌ Formulário não encontrado');
    await session.close();
    return;
  }
  
  // Select Especialização (level 2)
  await formFrame.selectOption('select[name="f_nivel"]', '2');
  await page.waitForTimeout(2000);
  
  // Click institution lupa
  const lupaLink = await formFrame.$('a[onclick*="sele_inst"]');
  if (!lupaLink) {
    console.error('❌ Link lupa não encontrado');
    await session.close();
    return;
  }
  
  await lupaLink.click();
  await page.waitForTimeout(5000);
  
  // Find CV3 modal
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst_form') || f.url().includes('prc_inst')) {
      cv3Frame = f;
      break;
    }
  }
  
  if (!cv3Frame) {
    // Try any frame that's not main and not form
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && !f.url().includes('pkg_formacao') && f.url() !== 'about:blank') {
        cv3Frame = f;
        break;
      }
    }
  }
  
  if (!cv3Frame) {
    console.error('❌ Modal CV3 não encontrado');
    console.log('Frames disponíveis:');
    for (const f of page.frames()) {
      console.log(`  ${f.url()}`);
    }
    await session.close();
    return;
  }
  
  console.log(`   CV3 Frame: ${cv3Frame.url()}`);
  
  // Find search input
  const searchInput = await cv3Frame.$('input[name="f_busca_inst"], input[type="text"], input[type="search"]');
  if (!searchInput) {
    console.log('   Inputs disponíveis:');
    const inputs = await cv3Frame.$$('input');
    for (const inp of inputs) {
      const name = await inp.getAttribute('name').catch(() => '');
      const type = await inp.getAttribute('type').catch(() => '');
      console.log(`     name="${name}" type="${type}"`);
    }
    await session.close();
    return;
  }
  
  // Type search term
  await searchInput.fill(searchTerm);
  console.log(`   Termo digitado: "${searchTerm}"`);
  
  // Find and click search button
  const searchBtn = await cv3Frame.$('input[value*="Pesquisar"], input[type="submit"], button[type="submit"], input[value="Pesquisar"]');
  if (searchBtn) {
    await searchBtn.click();
    await page.waitForTimeout(5000);
  }
  
  // Read results
  const bodyText = await cv3Frame.textContent('body').catch(() => '');
  const lines = bodyText.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && !l.startsWith('var ') && !l.startsWith('function'))
    .slice(0, 30);
  
  console.log('\n📋 Resultados:');
  for (const line of lines) {
    if (line.includes('FIAP') || line.includes('fiap') || line.includes('Instituto') || line.includes('Faculdade') || line.includes('Instituição') || line.includes('Pesquisar') || line.includes('Cadastrar') || line.includes('Nenhum') || line.includes('resultado')) {
      console.log(`   ${line}`);
    }
  }
  
  await nav.takeSnapshot('search_institution');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
