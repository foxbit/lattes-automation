/**
 * Popula Formação acadêmica/titulação no Lattes
 * Uso: npx tsx src/populate-formacao.ts [--dry-run]
 *
 * Module: formacao_academica (crud-list with selecionarNivel)
 * Menu: Formação > Formação acadêmica/titulação
 *
 * Estado atual: Graduação (Comunicação Social, Estácio, 2012-2016) já existe.
 *
 * A adicionar:
 * a) Especialização: Gestão de Produtos Digitais, FIAP, 2025-2026, Concluído
 * b) Disciplina isolada → mapeado para "Aperfeiçoamento" no Lattes:
 *    Design Centrado no Usuário, UFPR, 2025, Concluído
 *
 * Form fields:
 * - f_inst: lupa (sele_inst → modalCV3)
 * - f_curso: lupa (curso() → modalCV3, depends on f_cod_inst)
 * - f_ano_ini, f_ano_fim: text
 * - F_STATUS: radio (N=em andamento, S=concluído, I=incompleto)
 *
 * PATTERN:
 * 1. sele_inst(1) → opens modalCV3 → search → select → sets f_inst + f_cod_inst
 * 2. curso() → opens modalCV3 → search → select → sets f_curso + f_cod_curso
 * 3. Fill remaining fields and save
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface FormacaoEntry {
  nivel: string;
  curso: string;
  instituicao: string;
  anoInicio: string;
  anoFim: string;
  status: 'S' | 'N' | 'I';
}

const FORMACAO: FormacaoEntry[] = [
  {
    nivel: 'Especialização',
    curso: 'Gestão de Produtos Digitais',
    instituicao: 'FIAP',
    anoInicio: '2025',
    anoFim: '2026',
    status: 'S',
  },
  {
    nivel: 'Aperfeiçoamento',  // "Disciplina isolada" maps to this in Lattes
    curso: 'Design Centrado no Usuário',
    instituicao: 'UFPR',
    anoInicio: '2025',
    anoFim: '2025',
    status: 'S',
  },
];

/**
 * Search and select an institution via modalCV3
 */
async function fillInstitution(page: Page, formFrame: Frame, institution: string): Promise<boolean> {
  console.log(`   🔍 Buscando instituição: ${institution}...`);

  // Call sele_inst(1) to open the institution search
  await formFrame.evaluate(() => {
    (window as any).sele_inst(1);
  });
  await page.waitForTimeout(3000);

  // Find the modalCV3 frame
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }

  if (!cv3Frame) {
    console.log('   ❌ Frame de busca de instituição não encontrado');
    return false;
  }

  // Fill search term
  const searchInput = await cv3Frame.$('input[name="f_nome"]');
  if (!searchInput) {
    console.log('   ❌ Input de busca não encontrado');
    return false;
  }

  await searchInput.fill(institution);
  await page.waitForTimeout(500);

  // Click the search button (magnifying glass image or submit button)
  await cv3Frame.evaluate(() => {
    // Try multiple selectors for the search button
    const btns = document.querySelectorAll('a, input[type="submit"], input[type="button"], button, img');
    for (const btn of btns) {
      const tag = btn.tagName.toLowerCase();
      const src = (btn as HTMLImageElement).src || '';
      const alt = (btn as HTMLImageElement).alt || '';
      const value = (btn as HTMLInputElement).value || '';
      const text = btn.textContent?.trim() || '';
      const onclick = btn.getAttribute('onclick') || '';

      // Magnifying glass image, or search button
      if (src.includes('lupa') || src.includes('search') || src.includes('pesq') ||
          alt.includes('pesquisar') || alt.includes('lupa') ||
          value.includes('Pesquisar') || text.includes('Pesquisar') ||
          onclick.includes('pesquisar') || onclick.includes('submit')) {
        (btn as HTMLElement).click();
        return;
      }
    }
    // Fallback: submit the form
    const form = document.querySelector('form');
    if (form) form.submit();
  });

  await page.waitForTimeout(3000);

  // Check for results
  const results = await cv3Frame.evaluate(() => {
    const rows = document.querySelectorAll('tr[onclick], a[onclick]');
    return Array.from(rows).map(r => ({
      text: r.textContent?.trim().substring(0, 100),
      onclick: r.getAttribute('onclick')?.substring(0, 200),
    }));
  });

  console.log(`   Resultados encontrados: ${results.length}`);
  for (const r of results.slice(0, 3)) {
    console.log(`     • ${r.text}`);
  }

  if (results.length === 0) {
    console.log('   ⚠️  Nenhum resultado encontrado');
    // Close the modalCV3
    await page.evaluate(() => {
      document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return false;
  }

  // Click the first result
  const firstResult = await cv3Frame.$('tr[onclick], a[onclick]');
  if (firstResult) {
    const onclick = await firstResult.getAttribute('onclick');
    if (onclick) {
      await cv3Frame.evaluate(onclick);
    } else {
      await firstResult.click();
    }
    await page.waitForTimeout(2000);
  }

  // Remove overlay
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  // Verify institution was set
  const instValue = await formFrame.evaluate(() => {
    const inst = document.querySelector('input[name="f_inst"]') as HTMLInputElement;
    const codInst = document.querySelector('input[name="f_cod_inst"]') as HTMLInputElement;
    return { name: inst?.value, code: codInst?.value };
  });

  if (instValue.name || instValue.code) {
    console.log(`   ✅ Instituição = ${instValue.name} (código: ${instValue.code})`);
    return true;
  }

  console.log('   ⚠️  Instituição não foi definida após seleção');
  return false;
}

/**
 * Search and select a course via modalCV3 (depends on institution being set)
 */
async function fillCourse(page: Page, formFrame: Frame, course: string): Promise<boolean> {
  console.log(`   🔍 Buscando curso: ${course}...`);

  // Call curso() to open the course search
  await formFrame.evaluate(() => {
    (window as any).curso();
  });
  await page.waitForTimeout(3000);

  // Check if an alert appeared (institution not set)
  // The curso() function shows alert("Informe primeiramente a Instituição.") if no inst

  // Find the modalCV3 frame for course search
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso')) { cv3Frame = f; break; }
  }

  if (!cv3Frame) {
    console.log('   ⚠️  Frame de busca de curso não encontrado');
    // Try to fill directly
    const filled = await formFrame.evaluate((val: string) => {
      const inp = document.querySelector('input[name="f_curso"]') as HTMLInputElement;
      if (inp) {
        inp.disabled = false;
        inp.value = val;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, course);
    if (filled) console.log(`   ✅ Curso (direto) = ${course}`);
    return filled;
  }

  // Fill search term
  const searchInput = await cv3Frame.$('input[type="text"]');
  if (searchInput) {
    await searchInput.fill(course);
    await page.waitForTimeout(500);

    // Click search button
    await cv3Frame.evaluate(() => {
      const btns = document.querySelectorAll('a, input[type="submit"], input[type="button"], button, img');
      for (const btn of btns) {
        const src = (btn as HTMLImageElement).src || '';
        const value = (btn as HTMLInputElement).value || '';
        const text = btn.textContent?.trim() || '';
        if (src.includes('lupa') || src.includes('search') || value.includes('Pesquisar') || text.includes('Pesquisar')) {
          (btn as HTMLElement).click();
          return;
        }
      }
      const form = document.querySelector('form');
      if (form) form.submit();
    });

    await page.waitForTimeout(3000);
  }

  // Check results
  const results = await cv3Frame.evaluate(() => {
    const rows = document.querySelectorAll('tr[onclick], a[onclick]');
    return Array.from(rows).map(r => ({
      text: r.textContent?.trim().substring(0, 100),
      onclick: r.getAttribute('onclick')?.substring(0, 200),
    }));
  });

  console.log(`   Resultados: ${results.length}`);
  for (const r of results.slice(0, 3)) {
    console.log(`     • ${r.text}`);
  }

  if (results.length === 0) {
    console.log('   ⚠️  Nenhum curso encontrado');
    await page.evaluate(() => {
      document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return false;
  }

  // Click first result
  const firstResult = await cv3Frame.$('tr[onclick], a[onclick]');
  if (firstResult) {
    const onclick = await firstResult.getAttribute('onclick');
    if (onclick) await cv3Frame.evaluate(onclick);
    else await firstResult.click();
    await page.waitForTimeout(2000);
  }

  // Remove overlay
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  // Verify
  const cursoValue = await formFrame.evaluate(() => {
    const curso = document.querySelector('input[name="f_curso"]') as HTMLInputElement;
    return curso?.value;
  });

  if (cursoValue) {
    console.log(`   ✅ Curso = ${cursoValue}`);
    return true;
  }

  console.log('   ⚠️  Curso não definido');
  return false;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`🎓 Populando Formação acadêmica (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  console.log('📂 Navegando para Formação > Formação acadêmica/titulação...');
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);

  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao')) { listFrame = f; break; }
  }
  if (!listFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') { listFrame = f; break; }
    }
  }

  if (!listFrame) {
    console.error('❌ Frame da lista não encontrado');
    await session.close();
    return;
  }

  console.log(`   Frame: ${listFrame.url()}`);

  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`   Registros existentes: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`   • ${r.text.substring(0, 120)}`);
    }
  }

  await nav.takeSnapshot('formacao_before');

  if (dryRun) {
    console.log('🔒 [DRY-RUN] Seriam adicionados:');
    for (const f of FORMACAO) {
      console.log(`   • ${f.nivel}: ${f.curso} - ${f.instituicao} (${f.anoInicio}-${f.anoFim})`);
    }
    await session.close();
    return;
  }

  // Extract level URLs
  const levelData = await listFrame.evaluate(() => {
    const fn = (window as any).selecionarNivel;
    if (!fn) return null;
    const source = fn.toString();
    const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
    const baseUrl = urlMatch ? urlMatch[1] : '';
    const result: Array<{ name: string; url: string }> = [];
    let match: RegExpExecArray | null;
    const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
    while ((match = regex.exec(source)) !== null) {
      result.push({ name: match[1], url: baseUrl + match[2] });
    }
    return result;
  });

  if (!levelData || levelData.length === 0) {
    console.error('❌ Não foi possível extrair níveis');
    await session.close();
    return;
  }

  console.log(`\n📋 Níveis disponíveis: ${levelData.map(l => l.name).join(', ')}`);

  for (const entry of FORMACAO) {
    console.log(`\n➕ Adicionando: ${entry.nivel} - ${entry.curso}...`);

    const levelMatch = levelData.find(lv =>
      lv.name.toLowerCase().includes(entry.nivel.toLowerCase()) ||
      entry.nivel.toLowerCase().includes(lv.name.toLowerCase())
    );

    if (!levelMatch) {
      console.log(`   ❌ Nível "${entry.nivel}" não encontrado`);
      continue;
    }

    console.log(`   Nível: ${levelMatch.name}`);

    // Open form
    await listFrame.evaluate((url: string) => {
      (self.parent as any).modalCV2.setarUrl(url, true);
    }, levelMatch.url);
    await page.waitForTimeout(5000);

    // Find form frame
    let formFrame: Frame | null = null;
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listFrame.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
        if (url.includes('.form') || url.includes('pkg_formacao')) {
          formFrame = f;
          break;
        }
      }
    }
    if (!formFrame) {
      const nonMain = page.frames().filter(f =>
        f !== page.mainFrame() && f !== listFrame && f.url() !== 'about:blank'
      );
      if (nonMain.length > 0) formFrame = nonMain[nonMain.length - 1];
    }

    if (!formFrame) {
      console.log('   ❌ Frame do formulário não encontrado');
      continue;
    }

    // Fill institution via modalCV3
    const instOk = await fillInstitution(page, formFrame, entry.instituicao);
    if (!instOk) {
      console.log('   ❌ Falha ao preencher instituição');
      continue;
    }

    await page.waitForTimeout(1000);

    // Fill course via modalCV3 (depends on institution)
    const cursoOk = await fillCourse(page, formFrame, entry.curso);
    if (!cursoOk) {
      console.log('   ⚠️  Curso não pôde ser selecionado via busca');
    }

    await page.waitForTimeout(1000);

    // Fill year fields
    for (const [fieldName, value, label] of [
      ['f_ano_ini', entry.anoInicio, 'Ano início'],
      ['f_ano_fim', entry.anoFim, 'Ano fim'],
    ] as const) {
      await formFrame.evaluate(({ name, val }: { name: string; val: string }) => {
        const inp = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
        if (inp) { inp.value = val; inp.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { name: fieldName, val: value });
      console.log(`   ✅ ${label} = ${value}`);
    }

    // Set status
    await nav.selectRadio('F_STATUS', entry.status, formFrame);
    console.log(`   ✅ Status = Concluído`);

    // Save
    const saveResult = await nav.confirmAndSave(formFrame);
    if (saveResult.success) {
      console.log(`   ✅ "${entry.curso}" salvo!`);
    } else {
      console.log(`   ⚠️  Erro ao salvar: ${saveResult.error}`);
    }

    await page.waitForTimeout(2000);
  }

  await nav.takeSnapshot('formacao_after');
  nav.saveAuditLog();
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
