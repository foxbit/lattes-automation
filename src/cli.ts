/**
 * Lattes Automation CLI
 * 
 * Interactive test script to validate the automation engine.
 * Supports login, session restore, module reading, and form exploration.
 * 
 * Usage:
 *   npx tsx src/cli.ts login          - Login interativo via gov.br
 *   npx tsx src/cli.ts explore        - Explorar módulos do currículo
 *   npx tsx src/cli.ts read <module>  - Ler registros de um módulo
 *   npx tsx src/cli.ts mcp            - Iniciar MCP Server
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import {
  MODULE_REGISTRY,
  getCategories,
  getModulesByCategory,
  getModuleById,
} from './registry/module-registry.js';

async function handleLogin(): Promise<void> {
  console.log('\n🔐 === LOGIN INTERATIVO ===\n');
  const session = new SessionManager();
  const page = await session.loginInteractive();
  
  // Wait for the page to fully stabilize after login
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  const nav = new LattesNavigator(page);
  const categories = await nav.listMenuCategories();
  
  console.log('\n✅ Login bem-sucedido!');
  console.log(`📋 Categorias encontradas: ${categories.join(', ')}`);
  
  await nav.takeSnapshot('post_login');
  console.log('\n💡 Sessão salva. Use "explore" para navegar pelos módulos.');
  
  // Keep browser open for exploration
  console.log('🔎 Browser aberto. Pressione Ctrl+C para sair.');
  await new Promise(() => {}); // Keep alive
}

async function handleExplore(): Promise<void> {
  console.log('\n🔎 === EXPLORAÇÃO DO CURRÍCULO ===\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  // List all categories and their modules
  console.log('📂 Módulos disponíveis:\n');
  
  const categories = getCategories();
  for (const cat of categories) {
    const modules = getModulesByCategory(cat);
    console.log(`\n  📁 ${cat}`);
    for (const mod of modules) {
      console.log(`     └─ [${mod.id}] ${mod.name} (${mod.type})`);
    }
  }
  
  // Try to open "Dados gerais" menu and read submenu
  console.log('\n\n🔄 Testando navegação por menus...');
  const menuResult = await nav.openMenu('Dados gerais');
  if (menuResult.success) {
    console.log(`✅ Menu "Dados gerais" aberto. Itens: ${menuResult.data?.join(', ')}`);
  }
  
  // Try opening Identificação
  console.log('\n🔄 Abrindo módulo "Identificação"...');
  await nav.clickSubmenuItem('Identificação');
  await nav.wait(2000);
  
  // Read form fields
  const fields = await nav.readFormFields();
  const sections = await nav.listSidebarSections();
  const title = await nav.getModalTitle();
  
  console.log(`\n📋 Modal: ${title}`);
  console.log(`📑 Seções laterais: ${sections.join(', ')}`);
  console.log(`📝 Campos encontrados: ${fields.length}`);
  
  for (const field of fields) {
    const valueStr = field.value ? ` = "${field.value}"` : '';
    const reqStr = field.required ? ' [OBRIGATÓRIO]' : '';
    console.log(`   • ${field.label || field.name || field.id} (${field.type})${valueStr}${reqStr}`);
  }
  
  await nav.takeSnapshot('explore_identificacao');
  
  // Close the modal
  await nav.closeModal();
  
  console.log('\n✅ Exploração concluída!');
  nav.saveAuditLog();
  
  // Keep browser open
  console.log('🔎 Browser aberto. Pressione Ctrl+C para sair.');
  await new Promise(() => {}); // Keep alive
}

async function handleRead(moduleId: string): Promise<void> {
  console.log(`\n📖 === LENDO MÓDULO: ${moduleId} ===\n`);
  
  const module = getModuleById(moduleId);
  if (!module) {
    console.error(`❌ Módulo "${moduleId}" não encontrado.`);
    console.log('\nMódulos disponíveis:');
    for (const m of MODULE_REGISTRY) {
      console.log(`  ${m.id} - ${m.name}`);
    }
    process.exit(1);
  }
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  console.log(`📁 ${module.category} > ${module.name}`);
  console.log(`🔗 Rota: ${module.route}`);
  console.log(`📋 Tipo: ${module.type}`);
  
  // Navigate to the module
  const [category, ...rest] = module.menuPath;
  await nav.openMenu(category);
  
  if (rest.length > 0) {
    await nav.clickSubmenuItem(rest[0]);
    await nav.wait(2000);
  }
  
  if (module.type === 'form') {
    // Read form fields
    const fields = await nav.readFormFields();
    const sections = await nav.listSidebarSections();
    
    console.log(`\n📑 Seções: ${sections.join(', ')}`);
    console.log(`📝 Campos: ${fields.length}\n`);
    
    for (const field of fields) {
      console.log(`  ${field.label || field.name}: ${field.value || '(vazio)'} [${field.type}]`);
    }
  } else {
    // Read list
    const result = await nav.readModuleList();
    if (result.success && result.data) {
      console.log(`\n📝 Registros: ${result.data.records.length}`);
      console.log(`➕ Botão incluir: ${result.data.hasNewButton ? 'Sim' : 'Não'}`);
      
      for (const record of result.data.records) {
        console.log(`  ${record.index + 1}. ${record.text}`);
      }
    }
  }
  
  await nav.takeSnapshot(`read_${moduleId}`);
  await nav.closeModal();
  nav.saveAuditLog();
  
  await session.close();
}

async function handleMcp(): Promise<void> {
  console.log('\n🚀 === INICIANDO MCP SERVER ===\n');
  // Dynamic import to avoid loading everything at startup
  const { createMcpServer } = await import('./mcp/server.js');
  // The server auto-starts in main()
}

// ─── MAIN ────────────────────────────────────────────────────

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'login':
    handleLogin().catch(console.error);
    break;
  case 'explore':
    handleExplore().catch(console.error);
    break;
  case 'read':
    if (!args[0]) {
      console.error('❌ Especifique o ID do módulo. Ex: npx tsx src/cli.ts read idiomas');
      process.exit(1);
    }
    handleRead(args[0]).catch(console.error);
    break;
  case 'mcp':
    handleMcp().catch(console.error);
    break;
  default:
    console.log(`
🤖 Lattes Automation CLI
========================

Comandos disponíveis:

  login     - Login interativo via gov.br (abre browser)
  explore   - Explorar a estrutura do currículo
  read <id> - Ler registros de um módulo específico
  mcp       - Iniciar o MCP Server para uso com agentes

Exemplos:
  npx tsx src/cli.ts login
  npx tsx src/cli.ts explore
  npx tsx src/cli.ts read formacao_academica
  npx tsx src/cli.ts read idiomas
  npx tsx src/cli.ts mcp
`);
}
