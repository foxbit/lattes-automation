/**
 * Teste real de cadastro no Lattes
 *
 * Fluxo completo: abrir módulo → novo registro → preencher campos → salvar
 *
 * Uso:
 *   npx tsx src/test-cadastro.ts artigos_publicados        # preenche sem salvar
 *   npx tsx src/test-cadastro.ts artigos_publicados --save # preenche E salva
 *   npx tsx src/test-cadastro.ts --list                    # lista módulos disponíveis
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import { MODULE_REGISTRY, getModuleById } from './registry/module-registry.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Page, Frame } from 'playwright';

const OUT = join(process.cwd(), 'data', 'cadastro-test');

interface FieldFill {
  selector: string;
  value: string;
  label: string;
  action?: 'fill' | 'select' | 'radio' | 'check' | 'lupa';
}

// Dados de teste por módulo
interface FieldFill {
  selector: string;
  value: string;
  label: string;
  action?: 'fill' | 'select' | 'radio' | 'check' | 'lupa';
  lupaSearch?: string; // termo de busca para campo lupa
}

const TEST_DATA: Record<string, FieldFill[]> = {
  artigos_publicados: [
    { selector: 'input[name="f_titulo"]', value: 'Automated Lattes CV Updates Using LLM Agents', label: 'Título', action: 'fill' },
    { selector: 'input[name="f_titulo_en"]', value: 'Automated Lattes CV Updates Using LLM Agents', label: 'Título EN', action: 'fill' },
    { selector: 'input[name="f_ano"]', value: '2026', label: 'Ano', action: 'fill' },
    { selector: 'input[name="f_volume"]', value: '15', label: 'Volume', action: 'fill' },
    { selector: 'input[name="f_serie"]', value: '3', label: 'Série', action: 'fill' },
    { selector: 'input[name="f_pag_ini"]', value: '100', label: 'Página inicial', action: 'fill' },
    { selector: 'input[name="f_pag_fim"]', value: '115', label: 'Página final', action: 'fill' },
    { selector: 'input[name="f_issn"]', value: '1234-5678', label: 'ISSN', action: 'fill' },
    { selector: 'input[name="f_homepage"]', value: 'https://example.com/article', label: 'Home page', action: 'fill' },
  ],
  atuacao_profissional: [
    { selector: 'f_inst', value: 'FIAP', label: 'Instituição', action: 'lupa', lupaSearch: 'FIAP' },
    { selector: 'f_vinc', value: 'Professor Visitante', label: 'Vínculo', action: 'lupa', lupaSearch: 'Professor' },
    { selector: 'input[name="f_enqua"]', value: 'Pesquisador Visitante', label: 'Enquadramento', action: 'fill' },
    { selector: 'input[name="f_carga"]', value: '40', label: 'Carga horária', action: 'fill' },
    { selector: 'input[name="f_mes_ini"]', value: '01', label: 'Mês início', action: 'fill' },
    { selector: 'input[name="f_ano_ini"]', value: '2026', label: 'Ano início', action: 'fill' },
    { selector: 'input[name="f_status"][value="S"]', value: 'S', label: 'Status Atual', action: 'radio' },
    { selector: 'textarea[name="f_outras_inf"]', value: 'Atuação em projetos de automação e inteligência artificial aplicada à gestão acadêmica.', label: 'Outras info', action: 'fill' },
  ],
};

async function fillFields(nav: LattesNavigator, ctx: Frame | Page, fields: FieldFill[]): Promise<{ ok: string[]; fail: string[] }> {
  const ok: string[] = [];
  const fail: string[] = [];

  for (const field of fields) {
    try {
      if (field.action === 'lupa') {
        const searchTerm = field.lupaSearch || field.value;
        const result = await nav.fillLupa(field.selector, searchTerm, ctx);
        if (result.success) {
          ok.push(field.label);
        } else {
          fail.push(`${field.label}: ${result.error}`);
        }
      } else if (field.action === 'radio') {
        const radio = await ctx.$(field.selector);
        if (radio) {
          await radio.check();
          ok.push(field.label);
        } else {
          fail.push(field.label);
        }
      } else if (field.action === 'fill') {
        const input = await ctx.$(field.selector);
        if (input) {
          const isDisabled = await input.getAttribute('disabled');
          if (isDisabled !== null) {
            // Try to enable and fill
            await input.evaluate((el: HTMLElement) => el.removeAttribute('disabled'));
          }
          await input.fill('');
          await input.fill(field.value);
          ok.push(field.label);
        } else {
          fail.push(field.label);
        }
      }
    } catch (e) {
      fail.push(`${field.label}: ${(e as Error).message}`);
    }
  }

  return { ok, fail };
}

async function findFormFrame(page: Page, afterMs: number = 5000): Promise<Frame | null> {
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(afterMs / 5);
    for (const f of page.frames()) {
      const u = f.url();
      if (u.includes('.form') || u.includes('.inclui')) return f;
    }
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank' && !f.url().includes('.lista')) return f;
    }
  }
  return null;
}

async function testCadastro(moduleId: string, shouldSave: boolean): Promise<void> {
  const mod = getModuleById(moduleId);
  if (!mod) { console.error(`Módulo "${moduleId}" não encontrado.`); return; }

  const testData = TEST_DATA[moduleId];
  if (!testData) { console.error(`Sem dados de teste para "${moduleId}". Configure em TEST_DATA.`); return; }

  for (const d of [OUT, join(OUT, 'screenshots')]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  console.log(`\n🧪 TESTE DE CADASTRO: ${mod.name}`);
  console.log(`   Modo: ${shouldSave ? '🔥 SALVAR' : '🔒 PREENCHER SEM SALVAR'}`);
  console.log(`   Módulo: [${mod.type}] ${mod.category} > ${mod.name}\n`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // 1. Navegar ao módulo
  const [cat, ...sub] = mod.menuPath;
  await nav.openMenu(cat);
  if (sub.length) { await nav.clickSubmenuItem(sub[0]); await nav.wait(3000); }

  const preSS = await nav.takeSnapshot(`cadastro_${moduleId}_01_lista`);
  console.log('📸 Screenshot: lista');

  // 2. Frame da lista
  const listFrame = await nav.getModalFrame();
  if (!listFrame) { console.error('❌ Frame da lista não encontrado'); await session.close(); return; }

  // 3. Clicar "Incluir novo item"
  console.log('🆕 Clicando "Incluir novo item"...');
  const clickResult = await nav.clickNewRecord(listFrame);
  if (!clickResult.success) {
    console.error(`❌ Falha ao abrir novo registro: ${clickResult.error}`);
    await session.close();
    return;
  }

  // 4. Encontrar o frame do formulário
  console.log('🔍 Procurando frame do formulário...');
  const formFrame = await findFormFrame(page);
  if (!formFrame) {
    console.error('❌ Frame do formulário não encontrado');
    await session.close();
    return;
  }
  console.log(`   Frame: ${formFrame.url()}`);

  const formSS = await nav.takeSnapshot(`cadastro_${moduleId}_02_form_vazio`);
  console.log('📸 Screenshot: formulário vazio');

  // 5. Preencher campos
  console.log(`\n📝 Preenchendo ${testData.length} campos...`);
  const result = await fillFields(nav, formFrame, testData);

  if (result.ok.length > 0) {
    console.log(`   ✅ ${result.ok.length} preenchidos: ${result.ok.join(', ')}`);
  }
  if (result.fail.length > 0) {
    console.log(`   ❌ ${result.fail.length} falharam: ${result.fail.join(', ')}`);
  }

  const filledSS = await nav.takeSnapshot(`cadastro_${moduleId}_03_form_preenchido`);
  console.log('📸 Screenshot: formulário preenchido');

  // 6. Salvar (se autorizado)
  if (shouldSave) {
    console.log('\n⚠️  SALVANDO...');
    const saveResult = await nav.confirmAndSave(formFrame);
    if (saveResult.success) {
      console.log('✅ Registro salvo com sucesso!');
      const savedSS = await nav.takeSnapshot(`cadastro_${moduleId}_04_pos_save`);
      console.log('📸 Screenshot: pós-salvamento');
    } else {
      console.log(`❌ Erro ao salvar: ${saveResult.error}`);
    }
  } else {
    console.log('\n🔒 Modo seguro: preenchimento concluído SEM salvar.');
    console.log('   Execute com --save para salvar de fato.');
  }

  // Salvar relatório
  const report = {
    module: { id: mod.id, name: mod.name },
    mode: shouldSave ? 'save' : 'fill-only',
    fieldsFilled: result.ok,
    fieldsFailed: result.fail,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(OUT, `report_${Date.now()}.json`), JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n✅ Teste concluído. Browser aberto para inspeção visual.');
  await session.close();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('Módulos com dados de teste:');
    for (const id of Object.keys(TEST_DATA)) {
      const m = getModuleById(id);
      console.log(`  ${id} — ${m?.name || id} [${m?.type}]`);
    }
    return;
  }

  const moduleId = args.find(a => !a.startsWith('--'));
  if (!moduleId) {
    console.error('Uso: npx tsx src/test-cadastro.ts <moduleId> [--save]');
    console.error('     npx tsx src/test-cadastro.ts --list');
    process.exit(1);
  }

  const shouldSave = args.includes('--save');
  await testCadastro(moduleId, shouldSave);
}

main().catch(console.error);
