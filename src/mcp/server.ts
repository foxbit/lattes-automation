/**
 * MCP Server for Lattes Automation
 * 
 * Exposes Lattes operations as MCP tools that any compatible
 * AI agent (Claude, Gemini, etc.) can use to read and modify
 * the Lattes curriculum.
 * 
 * Tools follow a safe-by-default pattern:
 * - Read operations are unrestricted
 * - Write operations require explicit confirmation
 * - Destructive operations (delete, submit CV) are blocked by default
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SessionManager } from '../auth/session-manager.js';
import { LattesNavigator } from '../navigator/playwright-engine.js';
import {
  MODULE_REGISTRY,
  getCategories,
  getModulesByCategory,
  getModuleById,
  findModuleByName,
} from '../registry/module-registry.js';

// Zod is bundled with the MCP SDK

let sessionManager: SessionManager;
let navigator: LattesNavigator;

async function ensureNavigator(): Promise<LattesNavigator> {
  if (!navigator) {
    sessionManager = new SessionManager();
    const page = await sessionManager.getAuthenticatedPage();
    navigator = new LattesNavigator(page);
  }
  return navigator;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'lattes-automation',
    version: '1.0.0',
  });

  // ──────────────────────────────────────────────────────────
  //  SESSION TOOLS
  // ──────────────────────────────────────────────────────────

  server.tool(
    'lattes_check_session',
    'Verifica se a sessão do Lattes está ativa e autenticada',
    {},
    async () => {
      try {
        const nav = await ensureNavigator();
        const isValid = await sessionManager.validateSession();
        return {
          content: [{ type: 'text', text: JSON.stringify({
            authenticated: isValid,
            url: nav.getCurrentUrl(),
          }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'lattes_login',
    'Abre o browser para login manual no gov.br. O usuário faz o login e a sessão é salva automaticamente.',
    {},
    async () => {
      try {
        sessionManager = new SessionManager();
        const page = await sessionManager.loginInteractive();
        navigator = new LattesNavigator(page);
        return {
          content: [{ type: 'text', text: '✅ Login realizado com sucesso. Sessão salva.' }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro no login: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────────────
  //  READ TOOLS
  // ──────────────────────────────────────────────────────────

  server.tool(
    'lattes_list_modules',
    'Lista todas as categorias e módulos disponíveis no Lattes, com seus IDs e tipos.',
    {
      category: z.string().optional().describe('Filtrar por categoria (ex: "Formação", "Produções")'),
    },
    async ({ category }) => {
      const modules = category
        ? getModulesByCategory(category)
        : MODULE_REGISTRY;

      const categories = getCategories();

      const result = {
        totalModules: modules.length,
        categories,
        modules: modules.map(m => ({
          id: m.id,
          name: m.name,
          category: m.category,
          type: m.type,
          navigationPath: m.menuPath.join(' > '),
        })),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'lattes_read_module',
    'Abre um módulo do Lattes e lê os registros existentes. Navega pelo menu até o módulo e retorna a lista de registros.',
    {
      moduleId: z.string().describe('ID do módulo (ex: "formacao_academica", "idiomas", "artigos_publicados")'),
    },
    async ({ moduleId }) => {
      try {
        const nav = await ensureNavigator();
        const module = getModuleById(moduleId);

        if (!module) {
          return {
            content: [{ type: 'text', text: `Módulo "${moduleId}" não encontrado. Use lattes_list_modules para ver os IDs disponíveis.` }],
            isError: true,
          };
        }

        // Navigate to the module
        const [category, ...rest] = module.menuPath;
        await nav.openMenu(category);
        
        if (rest.length > 0) {
          await nav.clickSubmenuItem(rest[0]);
        }

        // Read the module state
        const result = await nav.readModuleList();

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Erro ao ler módulo: ${result.error}` }],
            isError: true,
          };
        }

        // Take a screenshot
        const screenshot = await nav.takeSnapshot(`module_${moduleId}`);

        return {
          content: [{ type: 'text', text: JSON.stringify({
            module: module.name,
            category: module.category,
            type: module.type,
            state: result.data,
            screenshot,
          }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'lattes_read_form',
    'Lê todos os campos de um formulário aberto no modal atual. Retorna labels, tipos, valores atuais e opções.',
    {},
    async () => {
      try {
        const nav = await ensureNavigator();
        const fields = await nav.readFormFields();
        const sections = await nav.listSidebarSections();
        const title = await nav.getModalTitle();

        return {
          content: [{ type: 'text', text: JSON.stringify({
            title,
            sections,
            fieldCount: fields.length,
            fields,
          }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'lattes_navigate_section',
    'Navega para uma seção lateral dentro do modal aberto (ex: "Dados pessoais", "Nome civil").',
    {
      sectionName: z.string().describe('Nome da seção para navegar'),
    },
    async ({ sectionName }) => {
      try {
        const nav = await ensureNavigator();
        const result = await nav.clickSidebarSection(sectionName);

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Erro: ${result.error}` }],
            isError: true,
          };
        }

        // Read fields after navigation
        const fields = await nav.readFormFields();
        return {
          content: [{ type: 'text', text: JSON.stringify({
            section: sectionName,
            fields,
          }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────────────
  //  WRITE TOOLS
  // ──────────────────────────────────────────────────────────

  server.tool(
    'lattes_fill_field',
    'Preenche um campo de formulário no modal aberto. NÃO SALVA automaticamente — use lattes_save após verificar.',
    {
      fieldLabel: z.string().describe('Label ou nome do campo a preencher'),
      value: z.string().describe('Valor a inserir no campo'),
    },
    async ({ fieldLabel, value }) => {
      try {
        const nav = await ensureNavigator();
        const result = await nav.fillField(fieldLabel, value);

        return {
          content: [{ type: 'text', text: result.success
            ? `✅ Campo "${fieldLabel}" preenchido com "${value}". Use lattes_read_form para verificar e lattes_save para salvar.`
            : `❌ ${result.error}`
          }],
          isError: !result.success,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'lattes_select_option',
    'Seleciona uma opção de radio button em um formulário.',
    {
      groupName: z.string().describe('Nome do grupo de radio buttons'),
      optionText: z.string().describe('Texto da opção a selecionar'),
    },
    async ({ groupName, optionText }) => {
      try {
        const nav = await ensureNavigator();
        const result = await nav.selectRadio(groupName, optionText);

        return {
          content: [{ type: 'text', text: result.success
            ? `✅ Opção "${optionText}" selecionada no grupo "${groupName}".`
            : `❌ ${result.error}`
          }],
          isError: !result.success,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'lattes_save',
    '⚠️ Clica no botão Salvar do formulário atual. Esta ação é IRREVERSÍVEL. Um screenshot é capturado antes e depois.',
    {
      confirm: z.literal('SIM_SALVAR').describe('Deve ser exatamente "SIM_SALVAR" para confirmar'),
    },
    async ({ confirm }) => {
      if (confirm !== 'SIM_SALVAR') {
        return {
          content: [{ type: 'text', text: '❌ Confirmação inválida. Envie confirm="SIM_SALVAR" para confirmar o salvamento.' }],
          isError: true,
        };
      }

      try {
        const nav = await ensureNavigator();
        const result = await nav.confirmAndSave();

        return {
          content: [{ type: 'text', text: result.success
            ? `✅ Salvamento realizado. Screenshot: ${result.screenshot}`
            : `❌ Possível erro: ${result.error}. Screenshot: ${result.screenshot}`
          }],
          isError: !result.success,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ──────────────────────────────────────────────────────────
  //  MODAL TOOLS
  // ──────────────────────────────────────────────────────────

  server.tool(
    'lattes_close_modal',
    'Fecha o modal atualmente aberto e retorna à página principal.',
    {},
    async () => {
      try {
        const nav = await ensureNavigator();
        const result = await nav.closeModal();
        return {
          content: [{ type: 'text', text: result.success ? '✅ Modal fechado.' : `❌ ${result.error}` }],
          isError: !result.success,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'lattes_screenshot',
    'Captura um screenshot do estado atual da página.',
    {
      label: z.string().optional().describe('Label para o screenshot').default('manual'),
    },
    async ({ label }) => {
      try {
        const nav = await ensureNavigator();
        const path = await nav.takeSnapshot(label);
        return {
          content: [{ type: 'text', text: `📸 Screenshot salvo: ${path}` }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Erro: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Start the MCP server via stdio transport
 */
async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 Lattes MCP Server iniciado via stdio');
}

// Run if this is the main module
main().catch(console.error);
