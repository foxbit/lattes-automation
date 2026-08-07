/**
 * Coleta de evidências reais da plataforma Lattes - v3 Robusta
 *
 * Para cada módulo alvo:
 * 1. Abre a lista via menu
 * 2. Lê registros + detecta botões Incluir/Editar
 * 3. Abre form de NOVO registro (via modalCV2)
 * 4. Lê TODOS os campos do formulário (com labels reais)
 * 5. Salva DOM dumps para análise offline
 *
 * Uso: npx tsx src/explore-modules.ts [moduleId]
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import { MODULE_REGISTRY, type LattesModule } from './registry/module-registry.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Page, Frame } from 'playwright';

const OUT = join(process.cwd(), 'data', 'exploration');

const TARGETS = [
  'formacao_academica',
  'atuacao_profissional',
  'projetos_pesquisa',
  'artigos_publicados',
  'patente',
];

interface FieldSchema {
  label: string;
  name?: string;
  type: string;
  options?: string[];
  required: boolean;
  hint?: string;
}

interface ModuleEvidence {
  module: { id: string; name: string; category: string; type: string; route: string };
  list: {
    recordCount: number;
    records: { index: number; text: string }[];
    newButtonOnclick?: string;
    editRowOnclick?: string;
  };
  newForm?: {
    url: string;
    fields: FieldSchema[];
    sections: string[];
  };
  editForm?: {
    url: string;
    fields: FieldSchema[];
  };
  errors: string[];
}

async function detectCV2Frame(page: Page, existingUrls: Set<string>): Promise<Frame | null> {
  // Retry up to 5 times with increasing waits
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.waitForTimeout(2000);

    const currentFrames = page.frames();
    for (const f of currentFrames) {
      const u = f.url();
      if (u === 'about:blank' || f === page.mainFrame()) continue;
      if (existingUrls.has(u)) continue;

      if (u.includes('.inclui') || u.includes('.form') || u.includes('.detalhe') || u.includes('informar')) {
        existingUrls.add(u);
        return f;
      }
    }

    // On attempt 2+, also check for any new PKG_/pkg_ frames
    for (const f of currentFrames) {
      const u = f.url();
      if (u === 'about:blank' || f === page.mainFrame()) continue;
      if (existingUrls.has(u)) continue;
      if (u.includes('PKG_') || u.includes('pkg_') || u.includes('prc_')) {
        existingUrls.add(u);
        return f;
      }
    }
  }
  return null;
}

async function detectWinDialogContent(frame: Frame): Promise<{ title: string; fields: any[] } | null> {
  await frame.page().waitForTimeout(4000);

  try {
    const dialogFrames = frame.childFrames();
    const searchCtx: Frame | Page = dialogFrames.length > 0 ? dialogFrames[0] : frame;

    const winTitle = await searchCtx.evaluate(() => {
      const el = document.querySelector('.win-title, .win-header span, .win-top-bar span, h2, .titulo');
      return el?.textContent?.trim() || '';
    }).catch(() => '');

    const fields: any[] = [];

    // Read dialog form fields
    const fieldData = await searchCtx.evaluate(() => {
      const result: { label: string; name: string | null; type: string; value: string }[] = [];
      const inputs = document.querySelectorAll('input[type="text"]:not([style*="display:none"]), input:not([type])[name], select, textarea');
      inputs.forEach((el: Element) => {
        const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (input.offsetParent === null) return;
        const name = input.getAttribute('name');
        const type = input.getAttribute('type') || input.tagName.toLowerCase();
        const val = 'value' in input ? input.value : '';
        let label = '';
        const td = input.closest('td');
        if (td) {
          const text = td.textContent?.trim() || '';
          const idx = text.indexOf(val || '');
          label = idx > 0 ? text.substring(0, idx).trim().replace(/[\s:]+$/, '') : text.substring(0, 60).trim();
        }
        if (!label) label = input.getAttribute('placeholder') || name || '';
        if (label.includes('{') || label === '') return;
        result.push({ label, name, type, value: val });
      });
      return result;
    }).catch(() => []);

    for (const f of fieldData) {
      fields.push(f);
    }

    if (winTitle) {
      try {
        const dom = await searchCtx.evaluate(() => document.body?.outerHTML || '');
        writeFileSync(join(OUT, 'dom_dumps', `dialog_${Date.now()}.html`), dom, 'utf-8');
      } catch {}
    }

    return { title: winTitle, fields };
  } catch {
    return null;
  }
}

async function safeClose(nav: LattesNavigator, label: string): Promise<void> {
  try {
    await nav.closeModal();
    await nav.wait(1500);
  } catch {
    console.log(`  ⚠️  closeModal(${label}) falhou (ignorado)`);
  }
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/^f_/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function exploreModule(
  nav: LattesNavigator, page: Page, mod: LattesModule
): Promise<ModuleEvidence> {
  const ev: ModuleEvidence = {
    module: { id: mod.id, name: mod.name, category: mod.category, type: mod.type, route: mod.route },
    list: { recordCount: 0, records: [] },
    errors: [],
  };

  console.log(`\n━━━ ${mod.category} > ${mod.name} ━━━`);

  // 1. Navegar
  const [cat, ...sub] = mod.menuPath;
  await nav.openMenu(cat);
  if (sub.length) { await nav.clickSubmenuItem(sub[0]); await nav.wait(3000); }
  await nav.takeSnapshot(`mod_${mod.id}_list`);

  // 2. Frame da lista
  const listFrame = await nav.getModalFrame();
  if (!listFrame) { ev.errors.push('List frame not found'); await safeClose(nav, 'list'); return ev; }

  // 3. DOM dump da lista
  try {
    const dom = await listFrame.content();
    writeFileSync(join(OUT, 'dom_dumps', `${mod.id}_list.html`), dom, 'utf-8');
  } catch {}

  // 4. Ler registros
  const listRes = await nav.readModuleList();
  if (listRes.success && listRes.data) {
    ev.list.recordCount = listRes.data.records.length;
    ev.list.records = listRes.data.records;
  }

  // 5. Detectar botões/ações
  const newBtn = await listFrame.$('a.adicionar');
  if (newBtn) {
    ev.list.newButtonOnclick = await newBtn.getAttribute('onclick') || undefined;
    console.log(`  ➕ Incluir: ${(ev.list.newButtonOnclick || '').substring(0, 100)}`);
  }
  const editRow = await listFrame.$('tr[onclick]');
  if (editRow) {
    ev.list.editRowOnclick = await editRow.getAttribute('onclick') || undefined;
    console.log(`  ✏️  EditRow: ${(ev.list.editRowOnclick || '').substring(0, 100)}`);
  }

  // 6. Abrir form NOVO registro
  if (mod.type === 'crud-list' && ev.list.newButtonOnclick) {
    console.log('  🆕 Abrindo form NOVO...');
    const existingFrames = new Set(page.frames().map(f => f.url()));
    const r = await nav.clickNewRecord(listFrame);
    if (r.success) {
      const formFrame = await detectCV2Frame(page, existingFrames);
      const isFormUrl = formFrame && (
        formFrame.url().includes('.inclui') ||
        formFrame.url().includes('.form') ||
        formFrame.url().includes('.detalhe') ||
        formFrame.url().includes('informar')
      );
      const isNotList = formFrame && !formFrame.url().includes('.lista');

      if (formFrame && (isFormUrl || isNotList)) {
        ev.newForm = { url: formFrame.url(), fields: [], sections: [] };
        console.log(`  📋 Form URL: ${formFrame.url()}`);

        // Salvar DOM do form
        try {
          const dom = await formFrame.content();
          writeFileSync(join(OUT, 'dom_dumps', `${mod.id}_new_form.html`), dom, 'utf-8');
        } catch {}

        // Ler campos
        const fields = await nav.readFormFields(formFrame);
        const sections = await nav.listSidebarSections(formFrame);

        ev.newForm.sections = sections;
        ev.newForm.fields = fields.map(f => ({
          label: cleanLabel(f.label || f.name || ''),
          name: f.name,
          type: f.type,
          options: f.options,
          required: f.required,
        }));

        console.log(`  📝 ${fields.length} campos, ${sections.length} seções`);
        for (const f of ev.newForm.fields.slice(0, 12)) {
          const optStr = f.options ? ` [${f.options.length} opções]` : '';
          console.log(`     • ${f.label} (${f.type})${optStr}`);
        }
        if (ev.newForm.fields.length > 12) console.log(`     ... +${ev.newForm.fields.length - 12} campos`);

        await safeClose(nav, 'form');
      } else {
        // Check for $.win() dialog content (informaDOI, infDadPat, etc.)
        const dialogInfo = await detectWinDialogContent(listFrame);
        if (dialogInfo) {
          ev.newForm = {
            url: `dialog:${dialogInfo.title}`,
            fields: dialogInfo.fields.map(f => ({
              label: cleanLabel(f.label || f.name || ''),
              name: f.name,
              type: f.type,
              required: false,
            })),
            sections: [],
          };
          console.log(`  🔲 Dialog: "${dialogInfo.title}" com ${dialogInfo.fields.length} campos`);
          for (const f of dialogInfo.fields) {
            console.log(`     • ${f.label} (${f.type})${f.value ? ` = "${f.value}"` : ''}`);
          }
          await safeClose(nav, 'dialog');
        } else {
          ev.errors.push('modalCV2 form frame not detected');
        }
      }
    } else {
      ev.errors.push(`clickNewRecord failed: ${r.error}`);
    }
  }

  // 7. Abrir form EDIÇÃO (se houver registros)
  if (ev.list.editRowOnclick && ev.list.recordCount > 0) {
    console.log('  ✏️  Abrindo form EDIÇÃO...');
    const existingFrames = new Set(page.frames().map(f => f.url()));
    const r = await nav.clickEditRecord(0, listFrame);
    if (r.success) {
      const formFrame = await detectCV2Frame(page, existingFrames);
      if (formFrame) {
        const fields = await nav.readFormFields(formFrame);
        ev.editForm = {
          url: formFrame.url(),
          fields: fields.map(f => ({
            label: cleanLabel(f.label || f.name || ''),
            name: f.name,
            type: f.type,
            options: f.options || [],
            required: f.required,
          })),
        };
        console.log(`  📝 ${ev.editForm.fields.length} campos (edição)`);
        await safeClose(nav, 'edit');
      }
    }
  }

  // 8. Fechar lista
  await safeClose(nav, 'list-final');
  await nav.takeSnapshot(`mod_${mod.id}_done`);

  return ev;
}

async function main() {
  for (const d of [OUT, join(OUT, 'dom_dumps')]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  const targetArg = process.argv[2];
  const modules = targetArg
    ? MODULE_REGISTRY.filter(m => m.id === targetArg)
    : MODULE_REGISTRY.filter(m => TARGETS.includes(m.id));

  if (!modules.length) { console.error(`Not found: ${targetArg}`); process.exit(1); }

  console.log(`🚀 Explorando ${modules.length} módulo(s)\n`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  const cats = await nav.listMenuCategories();
  console.log(`📂 Categorias: ${cats.join(', ')}`);

  const results: Record<string, ModuleEvidence> = {};

  for (const mod of modules) {
    try {
      results[mod.id] = await exploreModule(nav, page, mod);
    } catch (err) {
      results[mod.id] = {
        module: { id: mod.id, name: mod.name, category: mod.category, type: mod.type, route: mod.route },
        list: { recordCount: 0, records: [] },
        errors: [`Fatal: ${(err as Error).message}`],
      };
      console.log(`  💥 ${(err as Error).message}`);
    }
  }

  const outFile = join(OUT, `evidence_${Date.now()}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n✅ ${outFile}`);

  nav.saveAuditLog();
  await session.close();
}

main().catch(console.error);
