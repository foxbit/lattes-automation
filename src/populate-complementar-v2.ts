/**
 * Popula Formação complementar no Lattes — v2 fluxo corrigido
 * Uso: npx tsx src/populate-complementar-v2.ts
 *
 * Form tem 2 páginas:
 * Página 1: f_nivel (F=Curso Curta Duração), f_inst (lupa), f_curso (lupa),
 *           f_carga, F_STATUS (N/S/I), botão "Avançar"
 * Página 2: datas (mês/ano início/fim) + Salvar
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface ComplementarEntry {
  nome: string;
  instituicao: string;
  nivel: string;        // F=Curso Curta Duração, 8=Extensão, E=MBA, Y=Outros
  cargaHoraria: string;
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
    cargaHoraria: '40',
    mesInicio: '04', anoInicio: '2023',
    mesFim: '04', anoFim: '2023',
  },
  {
    nome: 'Formação Online em Design System & Ops',
    instituicao: 'Meiuca',
    nivel: 'F',
    cargaHoraria: '40',
    mesInicio: '01', anoInicio: '2021',
    mesFim: '07', anoFim: '2021',
  },
  {
    nome: 'Lovable Workshop',
    instituicao: 'PM3',
    nivel: 'F',
    cargaHoraria: '8',
    mesInicio: '09', anoInicio: '2025',
    mesFim: '09', anoFim: '2025',
  },
  {
    nome: '5º Webinário de Estudos em Design de Sistemas de Informação (WebEDSI)',
    instituicao: 'Universidade Federal do Paraná',
    nivel: 'F',
    cargaHoraria: '8',
    mesInicio: '05', anoInicio: '2026',
    mesFim: '05', anoFim: '2026',
  },
];

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
  const dryRun = process.argv.includes('--dry-run');
  console.log(`📚 Formação complementar v2 (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})\n`);

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
  if (!listFrame) { console.log('❌ Lista não encontrada'); await session.close(); return; }
  console.log(`✅ Lista: ${listFrame.url()}`);

  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`   Registros existentes: ${listState.data.records.length}`);
    for (const r of listState.data.records) console.log(`   • ${r.text.substring(0, 100)}`);
  }

  if (dryRun) {
    console.log('\n🔒 [DRY-RUN] Seriam adicionados:');
    for (const c of COMPLEMENTAR) {
      console.log(`   • ${c.nome} — ${c.instituicao} (${c.mesInicio}/${c.anoInicio})`);
    }
    await session.close();
    return;
  }

  let success = 0;
  let failed = 0;

  for (const entry of COMPLEMENTAR) {
    console.log(`\n📌 ${entry.nome} @ ${entry.instituicao}`);

    // Abrir novo
    const clickResult = await nav.clickNewRecord(listFrame);
    if (!clickResult.success) {
      console.log(`   ❌ Abrir: ${clickResult.error}`);
      failed++;
      continue;
    }

    const formFrame = await findFormFrame(page, listFrame.url());
    if (!formFrame) {
      console.log('   ❌ Form não encontrado');
      failed++;
      continue;
    }

    try {
      // 1. f_nivel
      await formFrame.selectOption('select[name="f_nivel"]', entry.nivel).catch(async () => {
        await formFrame.evaluate((val: string) => {
          const sel = document.querySelector('select[name="f_nivel"]') as HTMLSelectElement;
          if (sel) {
            sel.value = val;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, entry.nivel);
      });
      console.log(`   ✅ Nível: ${entry.nivel}`);
      await page.waitForTimeout(500);

      // 2. Instituição via lupa
      const instResult = await nav.fillLupa('f_inst', entry.instituicao, formFrame);
      const instVal = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
      console.log(`   🏫 f_inst = "${instVal}" (lupa: ${instResult.success ? 'ok' : 'falhou'})`);

      if (!instVal) {
        // Tentar termo alternativo
        const alt = entry.instituicao.split(' ')[0];
        await nav.fillLupa('f_inst', alt, formFrame);
        const v2 = await formFrame.evaluate(() =>
          (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
        console.log(`   ⚠️ f_inst (alt "${alt}") = "${v2}"`);
      }

      // 3. Curso via lupa ou direto
      const cursoResult = await nav.fillLupa('f_curso', entry.nome, formFrame);
      const cursoVal = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
      console.log(`   🎓 f_curso = "${cursoVal}" (lupa: ${cursoResult.success ? 'ok' : 'falhou'})`);
      if (!cursoVal) {
        await fillFast(formFrame, 'f_curso', entry.nome);
        console.log('   ⚠️  Curso preenchido direto');
      }

      // 4. Carga horária
      await fillFast(formFrame, 'f_carga', entry.cargaHoraria);
      console.log(`   ✅ Carga: ${entry.cargaHoraria}h`);

      // 5. Status = S (concluído)
      const statusRadio = await formFrame.$('input[name="F_STATUS"][value="S"]');
      if (statusRadio) {
        await statusRadio.evaluate((el: HTMLInputElement) => {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('click', { bubbles: true }));
        });
        console.log('   ✅ Status: Concluído');
      }

      // 6. Avançar para página 2
      console.log('   📄 Avançando...');
      await formFrame.evaluate(() => {
        const links = document.querySelectorAll('a, button, input[type="button"]');
        for (const el of links) {
          const text = el.textContent?.trim() || (el as HTMLInputElement).value || '';
          if (text.includes('Avançar')) {
            (el as HTMLElement).click();
            return;
          }
        }
        // Fallback: check()
        (window as any).check?.();
      });
      await page.waitForTimeout(4000);

      // 7. Página 2 — mapear campos visíveis
      const fields2 = await formFrame.evaluate(() => {
        return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
          name: (el as HTMLInputElement).name || '',
          type: (el as HTMLInputElement).type || 'select',
          visible: !!(el as HTMLElement).offsetParent,
        })).filter(f => f.visible);
      });
      console.log(`   📋 Campos pág 2: ${fields2.map(f => f.name || f.type).join(', ')}`);

      // Preencher datas (tentar vários nomes)
      const dateFields: Array<{ names: string[]; value: string; label: string }> = [
        { names: ['f_mes_ini', 'mes_inicio', 'f_mes_ini2'], value: entry.mesInicio, label: 'Mês início' },
        { names: ['f_ano_ini', 'ano_inicio', 'f_ano_ini2'], value: entry.anoInicio, label: 'Ano início' },
        { names: ['f_mes_fim', 'mes_fim', 'mes_conclusao'], value: entry.mesFim, label: 'Mês fim' },
        { names: ['f_ano_fim', 'ano_fim', 'ano_conclusao'], value: entry.anoFim, label: 'Ano fim' },
      ];
      for (const df of dateFields) {
        let ok = false;
        for (const name of df.names) {
          if (await fillFast(formFrame, name, df.value)) { ok = true; break; }
        }
        if (!ok) {
          // select para meses
          const sel = await formFrame.$(`select[name*="mes" i]`);
          if (sel && df.label.includes('Mês')) {
            try {
              await sel.selectOption(df.value);
              ok = true;
            } catch { /* ignore */ }
          }
        }
        console.log(`   ${ok ? '✅' : '⚠️'} ${df.label} = ${df.value}`);
      }

      // 8. Salvar
      await nav.takeSnapshot('compl_pre_save');
      console.log('   💾 Salvando...');
      const saveResult = await nav.confirmAndSave(formFrame);
      console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

      if (!saveResult.success) {
        const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
        if (confirmBtn) await confirmBtn.click();
        failed++;
      } else {
        success++;
      }

    } catch (e) {
      console.log(`   ❌ Erro: ${(e as Error).message}`);
      failed++;
    }

    // Fechar modal
    await nav.closeModal();
    await page.waitForTimeout(1500);
  }

  console.log(`\n📊 Resultado: ${success} salvo(s), ${failed} falha(s)`);

  // Verificar lista final
  const finalList = await nav.readModuleList();
  if (finalList.data) {
    console.log(`\n📋 Lista final (${finalList.data.records.length}):`);
    for (const r of finalList.data.records) console.log(`   • ${r.text.substring(0, 120)}`);
  }

  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
