/**
 * Popula o resumo do Lattes
 * Uso: npx tsx src/populate-resumo.ts [--dry-run]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const RESUMO = `Designer de Produto com formação em Comunicação Social e especialização em Gestão de Produtos Digitais. Atua em UX/UI Design, Design de Serviços, Inovação Digital e Design Centrado no Usuário, com experiência em projetos de plataformas SaaS, aplicativos mobile e portais institucionais para os setores de varejo, saúde, educação e serviços jurídicos.`;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`📝 Populando resumo do Lattes (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // Navigate to Texto inicial
  console.log('📂 Navegando para Dados gerais > Texto inicial...');
  await nav.openMenu('Dados gerais');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Texto inicial do Currículo Lattes');
  await page.waitForTimeout(5000);
  
  // Find the frame with the form
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_resume.form') || f.url().includes('prc_')) {
      formFrame = f;
      break;
    }
  }
  
  if (!formFrame) {
    // Try any non-main frame
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') {
        formFrame = f;
        break;
      }
    }
  }
  
  if (!formFrame) {
    console.error('❌ Frame do formulário não encontrado');
    await session.close();
    return;
  }
  
  console.log(`   Frame: ${formFrame.url()}`);
  
  // Read current fields
  const fields = await nav.readFormFields(formFrame);
  console.log(`   Campos encontrados: ${fields.length}`);
  
  for (const f of fields) {
    const val = f.value ? ` = "${f.value.substring(0, 50)}..."` : ' (vazio)';
    console.log(`   • ${f.label || f.name || f.id} (${f.type})${val}`);
  }
  
  // Find and fill the textarea
  const textarea = await formFrame.$('textarea');
  if (textarea) {
    if (!dryRun) {
      await textarea.fill('');
      await textarea.fill(RESUMO);
      console.log('✅ Resumo preenchido');
      
      // Click save - try multiple selectors
      const saveSelectors = [
        'input[value="Salvar"]',
        'button:has-text("Salvar")',
        '#btn_salvar',
        'input[type="button"][value*="Salvar"]',
        'a:has-text("Salvar")',
      ];
      let saved = false;
      for (const sel of saveSelectors) {
        const btn = await formFrame.$(sel);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(3000);
          console.log('✅ Salvo!');
          saved = true;
          break;
        }
      }
      if (!saved) {
        // Try clicking by text content in the frame
        const allButtons = await formFrame.$$('input[type="button"], button, a');
        for (const btn of allButtons) {
          const text = await btn.textContent().catch(() => '');
          const val = await btn.getAttribute('value').catch(() => '');
          if ((text || '').includes('Salvar') || (val || '').includes('Salvar')) {
            await btn.click();
            await page.waitForTimeout(3000);
            console.log('✅ Salvo via busca por texto!');
            saved = true;
            break;
          }
        }
      }
      if (!saved) {
        console.log('⚠️  Botão Salvar não encontrado');
      }
    } else {
      console.log('🔒 [DRY-RUN] Resumo seria preenchido');
    }
  } else {
    console.log('❌ TextArea não encontrada');
  }
  
  await nav.takeSnapshot('populate_resumo');
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
