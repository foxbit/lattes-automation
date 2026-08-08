# Achados e Bugs — Sessão de Automação 2026-08-07/08

## Resumo da Sessão

Tentativa de popular o Currículo Lattes via automação Playwright + MCP. A sessão durou ~3h e resultou em:
- ✅ **4 seções salvas** com sucesso
- ❌ **3 seções falharam** por bugs no engine
- 🔧 **4 bugs corrigidos** no engine
- 📋 **5 bugs identificados** que precisam de correção

---

## ✅ Seções Salvas com Sucesso

| Seção | Método | Observações |
|-------|--------|-------------|
| Resumo (texto inicial) | Script `populate-resumo-v2.ts` | Botão Salvar é `<a onclick="check()">`, não `<input>` |
| Áreas de atuação | Script `populate-areas.ts` (subagent) | Fluxo "Incluir nova" customizado |
| Idiomas | Script `populate-idiomas.ts` (subagent) | Registros já existiam — editou níveis |
| Graduação | Já existia | Estácio São Luís, 2012-2016 |

---

## ❌ Seções que Falharam

### 1. Atuação Profissional
**Problema:** Campos obrigatórios não preenchidos corretamente.
- O campo `f_inst` (Instituição) é do tipo **lupa** — precisa ser selecionado via busca CNPq, não apenas preenchido
- O campo `f_stavinc` (Tipo do vínculo) é um **select** que não foi identificado como obrigatório
- O campo `f_vinc` (Vínculo) é do tipo **lupa** com `dominio()` — opções fixas: Servidor público, Celetista, Professor Visitante, Bolsista, Outro

**Erro do Lattes:**
```
Campo Instituição obrigatório não informado.
Campo Tipo do vínculo obrigatório não informado.
Campo Vínculo obrigatório não informado.
```

### 2. Formação Acadêmica (Especialização FIAP)
**Problema:** Instituição "FIAP" não encontrada no banco CNPq.
- Busca por "FIAP" retorna apenas "Cadastrar nova instituição"
- Busca por "UFPR" também não encontra
- Precisa usar o fluxo "Cadastrar nova instituição" ou nome completo

### 3. Formação Complementar
**Problema:** Botão Salvar não encontrado + overlay bloqueando.
- O formulário de formação complementar tem estrutura diferente (2 etapas)
- O overlay do modalCV3 não é removido após operações de lupa

---

## 🔧 Bugs Corrigidos no Engine

### Bug 1: `fillField` — Selector CSS inválido
**Arquivo:** `src/navigator/playwright-engine.ts` (linha ~952)
**Problema:** Selector `text="f_enqua" >> .. >> input` falha com underscores
**Correção:** Adicionada Strategy 2 — busca por `input[name="f_enqua"]` diretamente
**Status:** ✅ Corrigido

### Bug 2: `confirmAndSave` — Overlay não removido no frame
**Arquivo:** `src/navigator/playwright-engine.ts` (linha ~1044)
**Problema:** `page.evaluate` remove overlays apenas na página principal, não no iframe
**Correção:** Adicionada remoção de overlays no frame (`ctx.evaluate`)
**Status:** ✅ Corrigido

### Bug 3: `confirmAndSave` — Verificação de erro na página errada
**Arquivo:** `src/navigator/playwright-engine.ts` (linha ~1058)
**Problema:** `page.textContent('body')` verifica texto da página principal, não do frame
**Correção:** Verifica texto do frame (`ctx.textContent`) quando disponível
**Status:** ✅ Corrigido

### Bug 4: `confirmAndSave` — Falso positivo em indicadores de erro
**Arquivo:** `src/navigator/playwright-engine.ts` (linha ~1061)
**Problema:** Indicadores como "erro", "error", "falha" são genéricos e aparecem em scripts JS
**Correção:** Indicadores mais específicos: "obrigatório", "preencha", "campo obrigatório"
**Status:** ✅ Corrigido

---

## 📋 Bugs Identificados (não corrigidos)

### Bug 5: Overlay persistente após operações de lupa
**Descrição:** Após a primeira operação de `fillLupa` (modalCV3), um `<div class="overlayDiv">` permanece na tela e bloqueia todos os cliques subsequentes.
**Impacto:** Alto — impossibilita múltiplas operações de lupa na mesma sessão
**Causa provável:** O modalCV3 não é fechado corretamente após seleção
**Sugestão:** Adicionar remoção de overlay após cada operação de lupa, ou fechar explicitamente o modalCV3

### Bug 6: Lupa de Instituição não seleciona corretamente
**Descrição:** O `fillLupa` para `f_inst` abre o modalCV3 e busca, mas o resultado não é aplicado ao campo. O campo fica vazio ou com valor incorreto.
**Impacto:** Alto — campos de Instituição e Vínculo são obrigatórios em Atuação e Formação
**Causa provável:** O mecanismo de seleção no modalCV3 não está clicando no resultado correto
**Sugestão:** Verificar se o resultado da busca é um `<a>` com onclick que chama uma função JS para selecionar

### Bug 7: Formação complementar — estrutura de 2 etapas
**Descrição:** O formulário de formação complementar tem uma estrutura de 2 etapas (selecionar nível → preencher campos), mas o engine espera uma única etapa.
**Impacto:** Médio — formação complementar não pode ser populada
**Sugestão:** Implementar detecção do padrão de 2 etapas no `clickNewRecord`

### Bug 8: `clickNewRecord` para formação acadêmica
**Descrição:** O botão "Incluir novo item" em formação acadêmica dispara `selecionarNivel()` que abre um seletor de nível antes do formulário. O engine detecta isso, mas o fluxo de preenchimento não lida corretamente com a seleção de nível.
**Impacto:** Médio — formação acadêmica não pode ser populada automaticamente
**Sugestão:** Melhorar o fluxo de `selecionarNivel` para aguardar o formulário após seleção

### Bug 9: Browser fecha por timeout em operações longas
**Descrição:** Após ~10 minutos de operações, o browser Playwright fecha automaticamente.
**Impacto:** Médio — impossibilita popular muitos registros de uma vez
**Causa provável:** Timeout de inatividade do browser ou sessão CNPq
**Sugestão:** Implementar keepalive ou reiniciar sessão entre operações

---

## 📁 Scripts Criados (para referência)

| Script | Módulo | Status |
|--------|--------|--------|
| `src/populate-resumo-v2.ts` | texto_inicial | ✅ Funciona |
| `src/populate-areas.ts` | areas_atuacao | ✅ Funciona |
| `src/populate-idiomas.ts` | idiomas | ✅ Funciona |
| `src/populate-formacao.ts` | formacao_academica | ❌ Bug lupa |
| `src/populate-complementar.ts` | formacao_complementar | ❌ Bug overlay |
| `src/populate-atuacao-v2.ts` | atuacao_profissional | ❌ Bug lupa + overlay |
| `src/populate-atuacao-v3.ts` | atuacao_profissional | ❌ Bug lupa |
| `src/populate-projetos.ts` | projetos_desenv | ⏳ Não testado |
| `src/search-institution.ts` | — | 🔧 Utilitário |
| `src/search-institutions.ts` | — | 🔧 Utilitário |
| `src/explore-areas.ts` | — | 🔧 Utilitário |
| `src/explore-forms.ts` | — | 🔧 Utilitário |
| `src/explore-complementar-p2.ts` | — | 🔧 Utilitário |
| `src/explore-formacao-curso.ts` | — | 🔧 Utilitário |

---

## 🎯 Próximos Passos Recomendados

1. **Corrigir Bug 5 (overlay)** — Prioridade alta. Adicionar `page.evaluate(() => document.querySelectorAll('.overlayDiv').forEach(el => el.remove()))` após cada `fillLupa`.

2. **Corrigir Bug 6 (lupa instituição)** — Prioridade alta. Verificar o mecanismo de seleção no modalCV3.

3. **Limpar scripts de exploração** — Remover `explore-*.ts` após debugging.

4. **Testar projetos** — O script `populate-projetos.ts` não foi testado ainda.

5. **Commitar alterações do engine** — As 4 correções são melhorias reais.

---

*Documento gerado em 2026-08-08 por Hermes Agent.*
