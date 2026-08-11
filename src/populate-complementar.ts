/**
 * Popula Formação complementar no Lattes
 * Uso: npx tsx src/populate-complementar.ts [--dry-run]
 *
 * Module: formacao_complementar (crud-list type)
 * Menu: Formação > Formação complementar
 *
 * Formulário tem 2 etapas:
 * 1. Dados gerais: Nível, Instituição (lupa), Curso (lupa), Carga Horária, Status
 * 2. Após "Avançar": Período (mês/ano início e fim)
 *
 * Campos (Página 1):
 * - f_nivel: select (F=Curso De Curta Duração, 8=Extensão, E=Mba, Y=Outros)
 * - f_inst: lupa (sele_inst → modalCV3)
 * - f_curso: lupa (sele_inst → modalCV3)
 * - f_carga_horaria: text
 * - F_STATUS: radio (N=em andamento, S=concluído, I=incompleto)
 *
 * A adicionar:
 * a) Certificate of Specialization in Design and Responsiveness - Bubble,
 *    Comunidade Sem Codar, Abr 2023
 * b) Formação em Design System & Ops, Meiuca, Jan 2021 - Jul 2021
 * c) Lovable Workshop, PM3, Set 2025
 * d) 5º Webinário de Estudos em Design de Sistemas de Informação (WebEDSI),
 *    UFPR/LabDSI, Mai 2026
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface ComplementarEntry {
  nome: string;
  instituicao: string;
  nivel: string;        // F=Curso De Curta Duração, 8=Extensão, E=Mba, Y=Outros
  mesInicio: string;
  anoInicio: string;
  mesFim: string;
  anoFim: string;
}

const COMPLEMENTAR: ComplementarEntry[] = [
  {
    nome: 'Certificate of Specialization in Design and Responsiveness - Bubble',
    instituicao: 'Comunidade Sem Codar',
    nivel: 'F',
    mesInicio: '04',
    anoInicio: '2023',
    mesFim: '04',
    anoFim: '2023',
  },
  {
    nome: 'Formação em Design System & Ops',
    instituicao: 'Meiuca',
    nivel: 'F',
    mesInicio: '01',
    anoInicio: '2021',
    mesFim: '07',
    anoFim: '2021',
  },
  {
    nome: 'Lovable Workshop',
    instituicao: 'PM3',
    nivel: 'F',
    mesInicio: '09',
    anoInicio: '2025',
    mesFim: '09',
    anoFim: '2025',
  },
  {
    nome: '5º Webinário de Estudos em Design de Sistemas de Informação (WebEDSI)',
    instituicao: 'UFPR',
    nivel: 'F',
    mesInicio: '05',
    anoInicio: '2026',
    mesFim: '05',
    anoFim: '2026',
  },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`📚 Populando Formação complementar (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // Navigate to Formação > Formação complementar
  console.log('📂 Navegando para Formação > Formação complementar...');
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação complementar');
  await page.waitForTimeout(5000);

  // Find list frame
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao_compl')) { listFrame = f; break; }
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

  // Read current list
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`   Registros existentes: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`   • ${r.text.substring(0, 120)}`);
    }
  }

  await nav.takeSnapshot('complementar_before');

  if (dryRun) {
    console.log('🔒 [DRY-RUN] Seriam adicionados:');
    for (const c of COMPLEMENTAR) {
      console.log(`   • ${c.nome} — ${c.instituicao} (${c.mesInicio}/${c.anoInicio} - ${c.mesFim}/${c.anoFim})`);
    }
    await session.close();
    return;
  }

  // Add each complementary course
  for (const entry of COMPLEMENTAR) {
    console.log(`\n➕ Adicionando: ${entry.nome}...`);

    // Click "Incluir novo item"
    const newRecordResult = await nav.clickNewRecord(listFrame);
    if (!newRecordResult.success) {
      console.log(`   ❌ Erro ao clicar Incluir: ${newRecordResult.error}`);
      break;
    }

    // Find form frame
    let formFrame: Frame | null = null;
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listFrame.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
        if (url.includes('FORMACAO_COMPL') || url.includes('.form')) {
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
      break;
    }

    console.log(`   Frame: ${formFrame.url()}`);

    // ── Page 1: Dados gerais ──

    // Set nivel
    await formFrame.evaluate((val: string) => {
      const sel = document.querySelector('select[name="f_nivel"]') as HTMLSelectElement;
      if (sel) {
        sel.value = val;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, entry.nivel);
    console.log(`   ✅ Nível = ${entry.nivel}`);
    await page.waitForTimeout(500);

    // Fill institution (lupa via sele_inst → modalCV3)
    const instResult = await nav.fillLupa('f_inst', entry.instituicao, formFrame);
    if (instResult.success) {
      console.log(`   ✅ Instituição = ${entry.instituicao}`);
    } else {
      console.log(`   ⚠️  Instituição falhou: ${instResult.error}`);
    }
    await page.waitForTimeout(1000);

    // Fill course (lupa)
    const cursoResult = await nav.fillLupa('f_curso', entry.nome, formFrame);
    if (cursoResult.success) {
      console.log(`   ✅ Curso = ${entry.nome}`);
    } else {
      console.log(`   ⚠️  Curso falhou: ${cursoResult.error}`);
      // Try direct fill as fallback
      const filled = await formFrame.evaluate((val: string) => {
        const inp = document.querySelector('input[name="f_curso"]') as HTMLInputElement;
        if (inp) {
          inp.disabled = false;
          inp.value = val;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, entry.nome);
      if (filled) console.log(`   ✅ Curso (direto) = ${entry.nome}`);
    }
    await page.waitForTimeout(1000);

    // Set status (S=concluído)
    const statusResult = await nav.selectRadio('F_STATUS', 'S', formFrame);
    if (statusResult.success) {
      console.log(`   ✅ Status = Concluído`);
    }

    // ── Click "Avançar" to go to page 2 ──
    console.log('   📄 Avançando para página 2...');
    const avancarClicked = await formFrame.evaluate(() => {
      const links = document.querySelectorAll('a, button, input[type="button"]');
      for (const el of links) {
        const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
        if (text.includes('Avançar')) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!avancarClicked) {
      console.log('   ⚠️  Botão Avançar não encontrado');
      // Maybe the form only has one page, try Salvar
      const saveResult = await nav.confirmAndSave(formFrame);
      if (saveResult.success) {
        console.log(`   ✅ Curso "${entry.nome}" salvo (1 página)!`);
      } else {
        console.log(`   ❌ Erro: ${saveResult.error}`);
      }
      await page.waitForTimeout(2000);
      continue;
    }

    await page.waitForTimeout(3000);

    // ── Page 2: Datas e detalhes ──
    // Read fields on page 2
    const fields2 = await nav.readFormFields(formFrame);
    console.log(`   Campos pág 2: ${fields2.length}`);
    for (const f of fields2) {
      const val = f.value ? ` = "${f.value.substring(0, 50)}"` : ' (vazio)';
      console.log(`     • ${f.label || f.name || f.id} (${f.type})${val}`);
    }

    // Fill date fields - try various field names
    const dateFields = [
      { names: ['f_mes_ini', 'mes_inicio'], value: entry.mesInicio, label: 'Mês início' },
      { names: ['f_ano_ini', 'ano_inicio'], value: entry.anoInicio, label: 'Ano início' },
      { names: ['f_mes_fim', 'mes_fim', 'mes_conclusao'], value: entry.mesFim, label: 'Mês fim' },
      { names: ['f_ano_fim', 'ano_fim', 'ano_conclusao'], value: entry.anoFim, label: 'Ano fim' },
    ];

    for (const df of dateFields) {
      let filled = false;
      for (const name of df.names) {
        const r = await nav.fillField(name, df.value, formFrame);
        if (r.success) {
          console.log(`   ✅ ${df.label} = ${df.value}`);
          filled = true;
          break;
        }
      }
      if (!filled) {
        // Try select for month fields
        if (df.label.includes('Mês')) {
          const sel = await formFrame.$(`select[name*="mes" i]`);
          if (sel) {
            const opts = await sel.evaluate((s: HTMLSelectElement) =>
              Array.from(s.options).map(o => `${o.value}|${o.text.trim()}`)
            );
            const match = opts.find(o => o.startsWith(`${df.value}|`) || o.includes(df.value));
            if (match) {
              const [val] = match.split('|');
              await sel.selectOption(val);
              console.log(`   ✅ ${df.label} (select) = ${df.value}`);
              filled = true;
            }
          }
        }
        if (!filled) {
          console.log(`   ⚠️  ${df.label} não encontrado`);
        }
      }
    }

    // Save on page 2
    const saveResult = await nav.confirmAndSave(formFrame);
    if (saveResult.success) {
      console.log(`   ✅ Curso "${entry.nome}" salvo!`);
    } else {
      console.log(`   ⚠️  Erro ao salvar: ${saveResult.error}`);
      // Try clicking Salvar directly
      const directSave = await formFrame.evaluate(() => {
        const links = document.querySelectorAll('a');
        for (const link of links) {
          if (link.textContent?.trim() === 'Salvar') {
            const onclick = link.getAttribute('onclick');
            if (onclick) { try { eval(onclick); } catch { (link as HTMLElement).click(); } }
            else { (link as HTMLElement).click(); }
            return true;
          }
        }
        return false;
      });
      if (directSave) {
        await page.waitForTimeout(3000);
        console.log(`   ✅ Salvo via click direto!`);
      }
    }

    await page.waitForTimeout(2000);
  }

  await nav.takeSnapshot('complementar_after');
  nav.saveAuditLog();
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
