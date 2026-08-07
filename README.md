# 🤖 Lattes Automation

Plataforma de automação agêntica do Currículo Lattes via **Playwright + MCP Server**.

Permite que agentes de IA (Claude, Gemini, etc.) leiam e **atualizem** seu currículo Lattes de forma segura, usando navegação automatizada no browser.

> **Skill para agentes**: Consulte [SKILL.md](./SKILL.md) para instruções completas de operação.

## 🏗️ Arquitetura

```
┌─ Login automático (servidor) ─────────────────────────┐
│ .env (GOVBR_CPF, GOVBR_SENHA) → Keycloak CNPq → Sessão│
└───────────────────────────────────────────────────────┘
                       │
┌─ Login interativo (GUI) ──────────────────────────────┐
│ Browser visível → gov.br/Keycloak manual → Sessão     │
└───────────────────────────────────────────────────────┘
                       │
                       ▼
         Sessão salva em data/auth/lattes-session.json
                       │
Agente LLM → Chama tools via MCP → Playwright navega o Lattes
                                   → Lê/preenche formulários
                                   → Lida com modais aninhados (CV1→CV2→CV3)
                                   → Autocomplete/lupa, ms-dropdown, selects
                                   → Screenshots de auditoria
```

### Sistema de modais do Lattes

A plataforma Lattes usa **3 níveis de modal** sobrepostos, cada um em seu próprio iframe:

```
modalCV1 (lista) → modalCV2 (formulário) → modalCV3 (busca/lupa)
```

O engine gerencia isso automaticamente, mas agentes devem entender a arquitetura (ver SKILL.md).

## 🚀 Setup

```bash
npm install
npx playwright install chromium
```

### Login automático (servidor)

```bash
cp .env.example .env
# Edite .env com seu CPF (apenas números) e senha
```

O sistema usará essas credenciais para autenticar via **Login Único CNPq (Keycloak)** em modo headless. Se as credenciais não estiverem configuradas, fará fallback para login interativo com browser gráfico.

## 📋 Comandos

| Comando | Descrição |
|---------|-----------|
| `npm run login` | Login interativo (abre browser) — fallback se .env não configurado |
| `npm run explore` | Explorar estrutura do currículo (usa login automático se .env existir) |
| `npm run read -- <id>` | Ler registros de um módulo |
| `npm run explore-modules` | Coletar schemas reais de todos os módulos |
| `npm run cadastro -- <id>` | Teste de cadastro (preenche sem salvar) |
| `npm run cadastro -- <id> --save` | Teste de cadastro completo (preenche e salva) |
| `npm run mcp` | Iniciar MCP Server para agentes |

### Exemplos

```bash
npm run read -- formacao_academica
npm run explore-modules
npm run cadastro -- atuacao_profissional
npm run cadastro -- artigos_publicados --save
```

## 🤖 MCP Server (para agentes)

```bash
npm run mcp
```

Configuração para agentes (Claude Desktop, etc.):

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

## 🔧 Tools MCP

| Tool | Tipo | Descrição |
|------|------|-----------|
| `lattes_check_session` | 🔍 | Verifica se a sessão está ativa |
| `lattes_login` | 🔐 | Abre browser para login manual |
| `lattes_list_modules` | 🔍 | Lista categorias e módulos |
| `lattes_read_module` | 🔍 | Abre um módulo e lê registros |
| `lattes_read_form` | 🔍 | Lê campos do formulário aberto |
| `lattes_navigate_section` | 🔍 | Navega entre seções laterais do form |
| `lattes_fill_field` | ✏️ | Preenche campo de texto/textarea |
| `lattes_fill_lupa` | ✏️ | Preenche campo autocomplete (lupa) |
| `lattes_select_option` | ✏️ | Seleciona radio button |
| `lattes_save` | ⚠️ | Salva (requer `SIM_SALVAR`) |
| `lattes_close_modal` | 🔄 | Fecha o modal atual |
| `lattes_screenshot` | 📸 | Captura screenshot |

## 🛡️ Segurança

- **Login automático ou manual**: Credenciais no `.env` (gitignored) para servidor, ou login interativo
- **Sessão local**: Cookies em `data/auth/` (gitignored)
- **Confirmação obrigatória**: Escrita exige `SIM_SALVAR`
- **Snapshots automáticos**: Screenshots antes/depois de cada operação
- **Audit log**: Toda ação registrada com timestamp

## 📂 Tipos de campo e como preenchê-los

| Tipo | Exemplo | Tool MCP |
|------|---------|----------|
| Texto normal | `f_titulo`, `f_carga` | `lattes_fill_field` |
| Textarea | `f_outras_inf` | `lattes_fill_field` |
| Select nativo | `F_TPO_NATUREZA` | `lattes_fill_field` |
| Radio button | `f_status` | `lattes_select_option` |
| Checkbox | `f_regime` | `lattes_fill_field` |
| **Lupa (autocomplete)** | `f_inst`, `f_vinc`, `f_curso` | `lattes_fill_lupa` |
| **ms-dropdown** | `f_tipo_privacidade` | `lattes_fill_field` |

### Campos lupa (autocomplete)

Campos com ícone de lupa (🔍) são `disabled` e exigem `lattes_fill_lupa` com o termo de busca:

```
lattes_fill_lupa --fieldName "f_inst" --searchTerm "FIAP"
```

A engine reconhece dois padrões:
- **`sele_inst()`**: abre modalCV3, busca, seleciona 1º resultado
- **`dominio()`**: extrai opções do combobox e seleciona a correspondente

## 📁 Estrutura

```
src/
├── auth/
│   └── session-manager.ts        # Login + persistência de sessão
├── navigator/
│   └── playwright-engine.ts      # Motor: navegação, modais, lupa, formulários
├── registry/
│   └── module-registry.ts        # 30+ módulos com rotas e tipos
├── mcp/
│   └── server.ts                 # MCP Server (tools para agentes)
├── cli.ts                        # CLI interativo
├── explore-modules.ts            # Coleta schemas reais via navegação
└── test-cadastro.ts              # Teste de fluxo completo de cadastro

data/
├── auth/             # Sessão (gitignored)
├── snapshots/        # Screenshots (gitignored)
├── logs/             # Audit logs (gitignored)
└── exploration/      # Schemas e DOM dumps dos módulos
```

## 📌 Módulos com schemas mapeados

Evidências coletadas via navegação real na plataforma (`data/exploration/`):

| Módulo | Novo | Edição | Destaques |
|--------|------|--------|-----------|
| Formação acadêmica | 30 campos | 22 campos | `selecionarNivel()` |
| Atuação profissional | 16 campos | — | Lupa instituição + vínculo |
| Projetos de pesquisa | 40 campos | — | 172 países, 27 UFs, 18 seções |
| Artigos publicados | 30 campos | — | `informaDOI()` |
| Patente | 2 campos (diálogo) | — | `infDadPat()` |
