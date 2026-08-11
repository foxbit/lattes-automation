/**
 * Popula/Atualiza Idiomas no Lattes
 * Uso: npx tsx src/populate-idiomas.ts [--dry-run]
 *
 * Module: idiomas (crud-list type)
 * Menu: Dados gerais > Idiomas
 *
 * Idiomas já existentes (dois registros):
 * - Inglês: Bem / Razoavelmente / Razoavelmente / Razoavelmente
 * - Espanhol: Bem / Razoavelmente / Razoavelmente / Bem
 *
 * Alvo:
 * - Inglês: Avançado → Bem (B) para Lê, Fala, Escreve, Compreende
 * - Espanhol: Intermediário/Conversação → Razoavelmente (R) para Lê, Escreve, Compreende;
 *             Bem (B) para Fala (Conversação)
 *
 * Campos do formulário:
 * - F_COD_IDIOMA: select (151 opções)
 * - F_LE: radio (P|R|B)
 * - F_CONVERSA: radio (P|R|B)
 * - F_ESCREVE: radio (P|R|B)
 * - F_COMPR: radio (P|R|B)
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

interface IdiomaUpdate {
  idioma: string;          // Must match existing record text
  leitura: 'P' | 'R' | 'B';
  conversa: 'P' | 'R' | 'B';
  escrita: 'P' | 'R' | 'B';
  compreende: 'P' | 'R' | 'B';
}

const IDIOMAS: IdiomaUpdate[] = [
  // Inglês: Avançado = Bem (B) para todas as habilidades
  { idioma: 'Inglês', leitura: 'B', conversa: 'B', escrita: 'B', compreende: 'B' },
  // Espanhol: Intermediário/Conversação
  { idioma: 'Espanhol', leitura: 'R', conversa: 'B', escrita: 'R', compreende: 'R' },
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`🗣️  Populando Idiomas (${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'})`);

  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);

  // Navigate to Dados gerais > Idiomas
  console.log('📂 Navegando para Dados gerais > Idiomas...');
  await nav.openMenu('Dados gerais');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Idiomas');
  await page.waitForTimeout(5000);

  // Find the list frame
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_idioma')) { listFrame = f; break; }
  }
  if (!listFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') { listFrame = f; break; }
    }
  }

  if (!listFrame) {
    console.error('❌ Frame da lista de idiomas não encontrado');
    await session.close();
    return;
  }

  console.log(`   Frame: ${listFrame.url()}`);

  // Read current records
  const listState = await nav.readModuleList();
  if (listState.data) {
    console.log(`   Registros existentes: ${listState.data.records.length}`);
    for (const r of listState.data.records) {
      console.log(`   • [${r.index}] ${r.text.substring(0, 100)}`);
    }
  }

  await nav.takeSnapshot('idiomas_before');

  if (dryRun) {
    console.log('🔒 [DRY-RUN] Seriam atualizados:');
    for (const i of IDIOMAS) {
      console.log(`   • ${i.idioma}: Lê=${i.leitura}, Fala=${i.conversa}, Escreve=${i.escrita}, Compreende=${i.compreende}`);
    }
    await session.close();
    return;
  }

  // For each language, find the existing record and edit it
  for (const idioma of IDIOMAS) {
    console.log(`\n✏️  Atualizando idioma: ${idioma.idioma}...`);

    // Find the record index by matching text
    const records = listState.data?.records || [];
    let recordIndex = -1;
    for (const r of records) {
      if (r.text.toLowerCase().includes(idioma.idioma.toLowerCase())) {
        recordIndex = r.index;
        break;
      }
    }

    if (recordIndex === -1) {
      console.log(`   ❌ Registro "${idioma.idioma}" não encontrado na lista`);
      continue;
    }

    console.log(`   Registro encontrado no índice ${recordIndex}`);

    // Click the record to edit it
    const editResult = await nav.clickEditRecord(recordIndex, listFrame);
    if (!editResult.success) {
      console.log(`   ❌ Erro ao abrir edição: ${editResult.error}`);
      continue;
    }

    await page.waitForTimeout(3000);

    // Find the form frame (modalCV2)
    let formFrame: Frame | null = null;
    for (const f of page.frames()) {
      const url = f.url();
      if (url.includes('pkg_idioma') && (url.includes('.form') || url.includes('.detalhe'))) {
        formFrame = f;
        break;
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

    console.log(`   Frame form: ${formFrame.url()}`);

    // Read current fields
    const fields = await nav.readFormFields(formFrame);
    console.log(`   Campos: ${fields.length}`);

    // Update proficiency radio buttons
    const proficiencies = [
      { name: 'F_LE', value: idioma.leitura, label: 'Lê' },
      { name: 'F_CONVERSA', value: idioma.conversa, label: 'Fala/Conversa' },
      { name: 'F_ESCREVE', value: idioma.escrita, label: 'Escreve' },
      { name: 'F_COMPR', value: idioma.compreende, label: 'Compreende' },
    ];

    for (const prof of proficiencies) {
      const result = await nav.selectRadio(prof.name, prof.value, formFrame);
      if (result.success) {
        console.log(`   ✅ ${prof.label} = ${prof.value}`);
      } else {
        console.log(`   ⚠️  Radio ${prof.name}=${prof.value} não encontrado: ${result.error}`);
      }
    }

    // Save
    const saveResult = await nav.confirmAndSave(formFrame);
    if (saveResult.success) {
      console.log(`   ✅ Idioma "${idioma.idioma}" atualizado!`);
    } else {
      console.log(`   ⚠️  Erro ao salvar: ${saveResult.error}`);
    }

    await page.waitForTimeout(2000);
  }

  await nav.takeSnapshot('idiomas_after');
  nav.saveAuditLog();
  await session.close();
  console.log('✅ Concluído');
}

main().catch(console.error);
