---
name: lattes-automation
description: Skill para operar o Currículo Lattes via automação Playwright + MCP. Use ao criar, ler ou atualizar registros do Lattes: formação, atuação, projetos, produções, patentes, etc.
---

# Lattes Automation

Automação do Currículo Lattes (CNPq) via browser controlado por Playwright exposto como MCP Server.

## Arquitetura da plataforma Lattes

O Lattes usa **3 níveis de modal** sobrepostos:

```
Página principal (PKG_MENU.menu)
  └─ modalCV1: lista de registros (pkg_*.lista)
       └─ modalCV2: formulário de novo/edição (pkg_*.form, PKG_*.inclui)
            └─ modalCV3: popup de busca/lupa (prc_inst_*, prc_pesq_*)
```

Cada modal carrega seu conteúdo em um **iframe** separado. Toda interação com campos exige contexto correto de frame.

## Fluxo de operação

### 1. Verificar sessão
```
lattes_check_session
```
Se não autenticado, usar `lattes_login` (abre browser para login manual gov.br).

### 2. Listar módulos
```
lattes_list_modules
lattes_list_modules --category "Formação"
```

### 3. Abrir um módulo e ler registros
```
lattes_read_module --moduleId "atuacao_profissional"
```
Retorna lista de registros, indica se há botão "Incluir novo item".

### 4. Criar novo registro

**Passo 1**: O agente deve usar `lattes_read_module` para abrir o módulo alvo.

**Passo 2**: O engine detecta automaticamente o padrão do botão "Incluir" e executa a ação correta:

| Padrão de onclick | Módulos | Comportamento |
|---|---|---|
| `self.parent.modalCV2.setarUrl(...)` | Atuação, Projetos | Abre formulário diretamente no modalCV2 |
| `selecionarNivel()` | Formação acadêmica | Abre seletor de nível → engine extrai URLs e chama modalCV2 com Doutorado (default) |
| `informaDOI()` | Artigos publicados | Abre diálogo DOI/ISSN → engine preenche DOI fake e clica Confirmar → abre form principal |
| `infDadPat()` | Patentes | Abre diálogo dados da patente → engine preenche e clica Confirmar |

**Passo 3**: Após o formulário abrir, usar `lattes_read_form` para ver os campos.

**Passo 4**: Preencher campos conforme o tipo:

### 5. Preencher campos

#### Campos de texto normais (`input[type="text"]`, `textarea`)
```
lattes_fill_field --fieldLabel "Enquadramento funcional" --value "Pesquisador"
```

#### Campos lupa (autocomplete com ícone de busca)
Campos com classe `input-lupa` são `disabled`. **NUNCA use `lattes_fill_field` neles.**
Use a ferramenta `lattes_fill_lupa` com o atributo `name` do campo e o termo de busca:
```
lattes_fill_lupa --fieldName "f_inst" --searchTerm "FIAP"
lattes_fill_lupa --fieldName "f_vinc" --searchTerm "Professor Visitante"
```

A engine reconhece dois padrões de lupa:
- **modalCV3** (`sele_inst()`): abre popup de busca, digita o termo, clica Pesquisar, seleciona 1º resultado
- **caixaMsg combobox** (`dominio()`): extrai opções do código fonte e seleciona a que corresponde ao termo

#### Radio buttons
```
lattes_select_option --groupName "f_status" --optionText "S"
```

#### Campos ms-dropdown (visibilidade)
Dropdown customizado do Lattes (Público/Privado). O engine detecta automaticamente.
```
lattes_fill_field --fieldLabel "f_tipo_privacidade" --value "Público"
```

#### Campos com múltiplas seções laterais
Formulários como Projetos têm 18 seções. Use `lattes_navigate_section` para alternar:
```
lattes_navigate_section --sectionName "Equipe"
lattes_read_form  # lê campos da seção atual
```

### 6. Salvar
```
lattes_save --confirm "SIM_SALVAR"
```
**NUNCA salve sem confirmação explícita do usuário.** O engine tira screenshot antes e depois.

### 7. Fechar
```
lattes_close_modal  # fecha modalCV2 (form)
lattes_close_modal  # fecha modalCV1 (lista)
```

## Ferramentas MCP disponíveis

| Tool | Uso |
|------|-----|
| `lattes_check_session` | Verificar autenticação |
| `lattes_login` | Login manual no browser |
| `lattes_list_modules` | Listar módulos disponíveis |
| `lattes_read_module` | Abrir módulo e ler registros |
| `lattes_read_form` | Ler campos do form aberto |
| `lattes_navigate_section` | Mudar seção lateral do form |
| `lattes_fill_field` | Preencher campo texto |
| `lattes_select_option` | Selecionar radio |
| `lattes_fill_lupa` | Preencher campo lupa (autocomplete) |
| `lattes_save` | Salvar (requer SIM_SALVAR) |
| `lattes_close_modal` | Fechar modal atual |
| `lattes_screenshot` | Screenshot do estado atual |

## Erros comuns e soluções

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Campo não encontrado | Campo está em outra seção lateral | Use `lattes_navigate_section` antes |
| `fill_field` falha em campo disabled | É um campo lupa | Use `lattes_fill_lupa` |
| `overlayDiv` bloqueia clique | ModalCV3 não foi fechado após lupa | Engine agora remove overlay automaticamente |
| Frame não detectado | modalCV2 ainda carregando | Aguardar 3-5s e tentar `lattes_read_form` novamente |
| DOI inválido | O Lattes rejeita DOIs que não existem | Use um DOI real ou preencha via ISSN |

## Módulos com schemas mapeados

A pasta `data/exploration/` contém DOM dumps e JSONs com a estrutura real de campos de cada módulo, coletados via navegação real na plataforma:

- `formacao_academica` — 30 campos (novo Doutorado) / 22 campos (edição Graduação)
- `atuacao_profissional` — 16 campos, 8 seções
- `projetos_pesquisa` — 40 campos, 18 seções, selects com 172 países e 27 UFs
- `artigos_publicados` — 30 campos, 22 seções
- `patente` — 2 campos no diálogo inicial

Consulte `data/exploration/evidence_*.json` para os schemas completos com nomes de campos, tipos e opções de select.
