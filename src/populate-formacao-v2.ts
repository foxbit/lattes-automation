/**
 * Popula Formação acadêmica/titulação no Lattes — v2 usando fillLupa corrigido
 * Uso: npx tsx src/populate-formacao-v2.ts
 *
 * Estado atual: Graduação (Comunicação Social, Estácio, 2012-2016) já existe.
 * A adicionar:
 * a) Especialização: Gestão de Produtos Digitais, FIAP, 2025-2026, Concluído
 * b) Aperfeiçoamento: Design Centrado no Usuário, UFPR, 2025, Concluído
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
    nivel: 'Aperfeiçoamento',
    curso: 'Design Centrado no Usuário',
    instituicao: 'Universidade Federal do Paraná',
    anoInicio: '2025',
    anoFim: '2025',
    status: 'S',
  },
];

async function findFormFrame(page: Page, listUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listUrl && url !== page.mainFrame().url() && url !== 'about:blank'
        && (url.includes('.form') || url.includes('pkg_formacao') || url.includes('PRC_FORMA'))) {
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
  console.log(`🎓 Formação acadêmica v2 (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})\n`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // Navegar
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);

  // Encontrar frame da lista
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao') || f.url().includes('pkg_formacao.lista')) { listFrame = f; break; }
  }
  if (!listFrame) {
    console.log('❌ Frame da lista não encontrado');
    await session.close();
    return;
  }
  console.log(`📋 Lista: ${listFrame.url()}`);

  // Listar registros existentes
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`   Registros existentes: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`   • ${r.text.substring(0, 120)}`);
    }
  }

  if (dryRun) {
    console.log('\n🔒 [DRY-RUN] Seriam adicionados:');
    for (const f of FORMACAO) {
      console.log(`   • ${f.nivel}: ${f.curso} - ${f.instituicao} (${f.anoInicio}-${f.anoFim})`);
    }
    await session.close();
    return;
  }

  // Extrair URLs dos níveis (selecionarNivel function)
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

  if (!levelData || levelData.length === 0) {
    console.log('❌ Não foi possível extrair níveis');
    await session.close();
    return;
  }

  console.log(`📋 Níveis: ${levelData.map(l => l.name).join(', ')}`);

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

    // Abrir form do nível
    await listFrame.evaluate((url: string) => {
      (self.parent as any).modalCV2.setarUrl(url, true);
    }, levelMatch.url);
    await page.waitForTimeout(5000);

    const formFrame = await findFormFrame(page, listFrame.url());
    if (!formFrame) {
      console.log('   ❌ Form não encontrado');
      continue;
    }
    console.log(`   ✅ Form: ${formFrame.url()}`);

    // 1. Instituição via fillLupa (corrigido)
    console.log(`   🏫 Instituição: ${entry.instituicao}`);
    const lupaInst = await nav.fillLupa('f_inst', entry.instituicao, formFrame);
    const instVal = await formFrame.evaluate(() =>
      (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
    console.log(`   f_inst = "${instVal}" (lupa: ${lupaInst.success ? 'ok' : 'falhou'})`);

    if (!instVal) {
      // Tentar termo alternativo
      const alt = entry.instituicao.split(' ')[0];
      await nav.fillLupa('f_inst', alt, formFrame);
      const v2 = await formFrame.evaluate(() =>
        (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
      console.log(`   f_inst (alt "${alt}") = "${v2}"`);
      if (!v2) {
        console.log('   ❌ Instituição não encontrada — pulando');
        await nav.closeModal();
        await page.waitForTimeout(1000);
        continue;
      }
    }

    // 2. Curso via fillLupa (curso)
    console.log(`   🎓 Curso: ${entry.curso}`);
    const lupaCurso = await nav.fillLupa('f_curso', entry.curso, formFrame);
    const cursoVal = await formFrame.evaluate(() =>
      (document.querySelector('input[name="f_curso"]') as HTMLInputElement)?.value || null);
    console.log(`   f_curso = "${cursoVal}" (lupa: ${lupaCurso.success ? 'ok' : 'falhou'})`);

    if (!cursoVal) {
      // Fallback: preencher direto
      await fillFast(formFrame, 'f_curso', entry.curso);
      console.log(`   ⚠️  Curso preenchido direto (sem lupa)`);
    }

    // 3. Anos
    await fillFast(formFrame, 'f_ano_ini', entry.anoInicio);
    await fillFast(formFrame, 'f_ano_fim', entry.anoFim);
    console.log(`   ✅ Anos: ${entry.anoInicio}-${entry.anoFim}`);

    // 4. Status
    const statusOk = await nav.selectRadio('F_STATUS', entry.status, formFrame);
    console.log(`   ✅ Status: ${statusOk.success ? entry.status : 'falhou'}`);

    // 5. Salvar
    console.log('   💾 Salvando...');
    const saveResult = await nav.confirmAndSave(formFrame);
    console.log(`   ${saveResult.success ? '✅✅ SALVO!' : '❌ ' + saveResult.error}`);

    // Se erro, fechar diálogo
    if (!saveResult.success) {
      const confirmBtn = await formFrame.$('input[value="Confirmar"], button:has-text("Confirmar")');
      if (confirmBtn) await confirmBtn.click();
    }

    // Fechar modal
    await nav.closeModal();
    await page.waitForTimeout(1500);
  }

  await nav.takeSnapshot('formacao_v2_after');
  await session.close();
  console.log('\n✅ Formação acadêmica concluída');
}

main().catch(console.error);
