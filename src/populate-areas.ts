/**
 * Popula Áreas de atuação no Lattes
 * Uso: npx tsx src/populate-areas.ts [--dry-run]
 *
 * Module: areas_atuacao (form type)
 * Menu: Atuação > Áreas de atuação
 *
 * O formulário apresenta:
 * - Input de busca (autocomplete)
 * - Link "Incluir nova" → abre win-wrapper dialog para área personalizada
 * - Link "Listar todos" para expandir a árvore CNPq
 *
 * Estratégia:
 * 1. Digitar no input de busca para buscar na árvore CNPq
 * 2. Se encontrar item na árvore, clicar nele
 * 3. Senão, usar "Incluir nova" → preencher nome → confirmar
 * 4. Fechar win-wrapper se necessário
 * 5. Salvar
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

const AREAS = [
  'Design de Produto',
  'Design de Interação',
  'Design Visual',
  'Interação Humano-Computador',
];

async function closeWinWrapper(formFrame: Frame, page: Page): Promise<void> {
  // Close any win-wrapper dialog that might be open
  await formFrame.evaluate(() => {
    // Remove win-wrapper overlays
    const wrappers = document.querySelectorAll('.win-wrapper, .win-overlay, .blockOverlay');
    wrappers.forEach(el => {
      const parent = el.parentElement;
      if (parent) parent.removeChild(el);
    });
    // Also try to close via the close button
    const closeBtn = document.querySelector('.win-wrapper .tool.close, .win-wrapper a[title*="fechar" i], .win-wrapper .close');
    if (closeBtn) (closeBtn as HTMLElement).click();
  }).catch(() => {});

  // Also remove overlays at the page level
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, .win-wrapper, .win-overlay').forEach(el => el.remove());
  }).catch(() => {});

  await page.waitForTimeout(500);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`🏷️  Populando Áreas de atuação (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // Navigate to Atuação > Áreas de atuação
  console.log('📂 Navegando para Atuação > Áreas de atuação...');
  await nav.openMenu('Atuação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Áreas de atuação');
  await page.waitForTimeout(5000);

  // Find the form frame
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url.includes('prc_area_atuacao')) {
      formFrame = f;
      break;
    }
  }

  if (!formFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') {
        formFrame = f;
        break;
      }
    }
  }

  if (!formFrame) {
    console.error('❌ Frame do formulário de áreas não encontrado');
    await nav.takeSnapshot('areas_no_frame');
    await session.close();
    return;
  }

  console.log(`   Frame: ${formFrame.url()}`);
  await nav.takeSnapshot('areas_before');

  if (dryRun) {
    console.log('🔒 [DRY-RUN] Seriam adicionadas as áreas:');
    for (const area of AREAS) {
      console.log(`   • ${area}`);
    }
    await session.close();
    return;
  }

  // For each area
  for (const areaName of AREAS) {
    console.log(`\n➕ Adicionando área: ${areaName}...`);

    // Ensure no win-wrapper is blocking
    await closeWinWrapper(formFrame, page);

    // Find the search input
    const searchInput = await formFrame.$('input[type="text"]:not([name])');
    if (!searchInput) {
      console.log('   ❌ Input de busca não encontrado');
      continue;
    }

    // Strategy 1: Search in the tree by typing
    await searchInput.click({ force: true });
    await page.waitForTimeout(300);
    await searchInput.fill('');
    await searchInput.type(areaName.substring(0, 10), { delay: 30 });
    await page.waitForTimeout(1500);

    // Try to find and click a matching item in the autocomplete/tree
    const found = await formFrame.evaluate((term: string) => {
      // Check for autocomplete dropdown
      const dropdowns = document.querySelectorAll('.ui-autocomplete, .ui-menu, [class*="suggest"], [class*="dropdown"], [class*="result"]');
      for (const dd of dropdowns) {
        const items = dd.querySelectorAll('li, a, .item');
        for (const item of items) {
          const text = item.textContent?.trim() || '';
          if (text.toLowerCase().includes(term.toLowerCase()) && text.length < 200) {
            (item as HTMLElement).click();
            return { method: 'autocomplete', text };
          }
        }
      }

      // Check tree labels
      const labels = document.querySelectorAll('a.label');
      for (const label of labels) {
        const text = label.textContent?.trim() || '';
        if (text.toLowerCase().includes(term.toLowerCase())) {
          // Find the sibling icon to click (the clickable element)
          const parent = label.parentElement;
          if (parent) {
            const icon = parent.querySelector('.icon.item');
            if (icon) {
              (icon as HTMLElement).click();
              return { method: 'tree-icon', text };
            }
          }
          (label as HTMLElement).click();
          return { method: 'tree-label', text };
        }
      }

      return { method: 'none' };
    }, areaName);

    if (found.method !== 'none') {
      console.log(`   ✅ Selecionado via ${found.method}: ${found.text}`);
      await page.waitForTimeout(1000);
      continue;
    }

    // Strategy 2: Use "Incluir nova" for custom area
    console.log('   Área não encontrada na busca, usando "Incluir nova"...');

    // Clear search input first
    await searchInput.fill('');
    await page.waitForTimeout(300);

    // Click "Incluir nova"
    const incluirResult = await formFrame.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent?.trim() === 'Incluir nova') {
          (link as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!incluirResult) {
      console.log('   ❌ Link "Incluir nova" não encontrado');
      continue;
    }

    await page.waitForTimeout(2000);

    // A win-wrapper dialog should have appeared with an input for the custom area name
    // Find inputs inside the win-wrapper
    const filled = await formFrame.evaluate((term: string) => {
      // Look for inputs in win-wrapper or newly visible inputs
      const winWrapper = document.querySelector('.win-wrapper');
      const container = winWrapper || document;

      const inputs = container.querySelectorAll('input[type="text"]');
      for (const inp of inputs) {
        const htmlInp = inp as HTMLInputElement;
        // Skip the main search input
        if (!htmlInp.name && htmlInp.placeholder?.includes('Digite')) continue;

        // Fill this input with the area name
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(htmlInp, term);
        htmlInp.dispatchEvent(new Event('input', { bubbles: true }));
        htmlInp.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: true, inputName: htmlInp.name || htmlInp.id || 'unnamed' };
      }

      // Also try textareas
      const textareas = container.querySelectorAll('textarea');
      for (const ta of textareas) {
        const htmlTa = ta as HTMLTextAreaElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(htmlTa, term);
        htmlTa.dispatchEvent(new Event('input', { bubbles: true }));
        htmlTa.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: true, inputName: 'textarea' };
      }

      return { filled: false };
    }, areaName);

    if (filled.filled) {
      console.log(`   ✅ Nome preenchido no campo: ${filled.inputName}`);
    } else {
      console.log('   ⚠️  Nenhum campo encontrado no win-wrapper');
    }

    // Click confirm button in win-wrapper
    const confirmed = await formFrame.evaluate(() => {
      const winWrapper = document.querySelector('.win-wrapper');
      const container = winWrapper || document;

      // Look for confirm/add/save buttons
      const btns = container.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
      for (const btn of btns) {
        const text = btn.textContent?.trim() || (btn as HTMLInputElement).value || '';
        const onclick = btn.getAttribute('onclick') || '';
        if (text.includes('Confirmar') || text.includes('Salvar') || text.includes('Adicionar') ||
            text.includes('OK') || text.includes('Incluir') || onclick.includes('confirm') || onclick.includes('salvar')) {
          (btn as HTMLElement).click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    });

    if (confirmed.clicked) {
      console.log(`   ✅ Botão confirmado: ${confirmed.text}`);
    } else {
      console.log('   ⚠️  Botão de confirmação não encontrado, tentando Enter...');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(2000);

    // Close any remaining win-wrapper
    await closeWinWrapper(formFrame, page);
  }

  // Save the form
  console.log('\n💾 Salvando áreas de atuação...');

  const saved = await formFrame.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const link of links) {
      if (link.textContent?.trim() === 'Salvar') {
        const onclick = link.getAttribute('onclick');
        if (onclick) {
          // Execute onclick in context
          try { eval(onclick); } catch { (link as HTMLElement).click(); }
        } else {
          (link as HTMLElement).click();
        }
        return true;
      }
    }
    return false;
  });

  if (saved) {
    await page.waitForTimeout(3000);
    console.log('✅ Áreas de atuação salvas!');
  } else {
    console.log('⚠️  Botão Salvar não encontrado no frame');
    // Try at page level
    const saveResult = await nav.confirmAndSave(formFrame);
    console.log(saveResult.success ? '✅ Salvo!' : `❌ Erro: ${saveResult.error}`);
  }

  await nav.takeSnapshot('areas_after');
  nav.saveAuditLog();
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
