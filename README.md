# 🤖 Lattes Automation

Plataforma de automação agêntica do Currículo Lattes via **Playwright + MCP Server**.

Permite que agentes de IA (Claude, Gemini, etc.) leiam e atualizem seu currículo Lattes de forma segura, usando navegação automatizada no browser.

## 🏗️ Arquitetura

```
Usuário → Login manual via gov.br (uma vez)
       → Sessão salva via cookies/storageState
       
Agente LLM → Chama tools via MCP → Playwright navega o Lattes
                                  → Lê/preenche formulários
                                  → Screenshots de auditoria
```

### Componentes

| Componente | Responsabilidade |
|-----------|-----------------|
| **Session Manager** | Login manual + persistência de sessão gov.br |
| **Playwright Navigator** | Navegação, iframes, modais, formulários |
| **Module Registry** | Mapeamento de todos os 30+ módulos do Lattes |
| **MCP Server** | Expõe operações como tools para agentes LLM |

## 🚀 Setup

```bash
# Instalar dependências
npm install

# Instalar browser Chromium
npx playwright install chromium
```

## 📋 Uso

### Login Interativo

```bash
npm run login
```

Abre um browser para você fazer login via gov.br. A sessão é salva automaticamente.

### Explorar Currículo

```bash
npm run explore
```

Navega pelos módulos do currículo, mostrando menus, campos e registros.

### Ler Módulo Específico

```bash
npm run read -- formacao_academica
npm run read -- idiomas
npm run read -- artigos_publicados
```

### MCP Server (para agentes)

```bash
npm run mcp
```

Inicia o servidor MCP via stdio. Configuração para agentes:

```json
{
  "mcpServers": {
    "lattes": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/caminho/para/lattes-automation"
    }
  }
}
```

## 🔧 Tools MCP Disponíveis

| Tool | Tipo | Descrição |
|------|------|-----------|
| `lattes_check_session` | 🔍 Leitura | Verifica se a sessão está ativa |
| `lattes_login` | 🔐 Auth | Abre browser para login manual |
| `lattes_list_modules` | 🔍 Leitura | Lista categorias e módulos |
| `lattes_read_module` | 🔍 Leitura | Lê registros de um módulo |
| `lattes_read_form` | 🔍 Leitura | Lê campos do formulário aberto |
| `lattes_navigate_section` | 🔍 Leitura | Navega entre seções do modal |
| `lattes_fill_field` | ✏️ Escrita | Preenche um campo (não salva) |
| `lattes_select_option` | ✏️ Escrita | Seleciona radio/checkbox |
| `lattes_save` | ⚠️ Persistência | Salva (requer confirmação explícita) |
| `lattes_close_modal` | 🔄 Navegação | Fecha o modal atual |
| `lattes_screenshot` | 📸 Auditoria | Captura screenshot |

## 🛡️ Segurança

- **Login manual**: Nunca armazena senha — o usuário faz login via gov.br normalmente
- **Sessão local**: Cookies salvos em `data/auth/` (gitignored)
- **Preview obrigatório**: Toda escrita exige confirmação explícita (`SIM_SALVAR`)
- **Snapshots automáticos**: Screenshots antes/depois de cada operação
- **Audit log**: Toda ação registrada com timestamp

## 📁 Estrutura

```
src/
├── auth/
│   └── session-manager.ts     # Login + persistência de sessão
├── navigator/
│   └── playwright-engine.ts   # Motor de navegação do Lattes
├── registry/
│   └── module-registry.ts     # Mapeamento dos módulos
├── mcp/
│   └── server.ts              # MCP Server
└── cli.ts                     # CLI interativo

data/
├── auth/        # Sessão persistida (gitignored)
├── snapshots/   # Screenshots de auditoria
└── logs/        # Logs de ações
```

## 📌 Módulos Suportados

- **Dados gerais**: Identificação, Endereço, Idiomas, Prêmios, Texto inicial
- **Formação**: Acadêmica, Pós-doutorado, Complementar
- **Atuação**: Profissional, Áreas, Linhas de pesquisa
- **Projetos**: Pesquisa, Extensão, Ensino, Desenvolvimento
- **Produções**: Artigos, Livros, Trabalhos em anais, Textos
- **Patentes**: Patente, Programa de computador
- **Eventos**: Participação em eventos
- **Orientações**: Concluídas
- **Bancas**: Trabalhos de conclusão
- **Citações**: Indicadores bibliográficos
