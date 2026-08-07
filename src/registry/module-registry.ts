/**
 * Module Registry for Lattes
 * 
 * Structured mapping of all Lattes modules, their routes,
 * field definitions, and navigation paths.
 * 
 * Based on exploration of the authenticated interface and
 * the module_map.md from the Manus analysis.
 */

export interface LattesModule {
  id: string;
  name: string;
  category: string;
  route: string;
  type: 'form' | 'crud-list' | 'text-form' | 'indicators';
  menuPath: string[];  // How to navigate to it: ["Dados gerais", "Identificação"]
  description?: string;
}

/**
 * Complete registry of all known Lattes modules
 * Organized by the 12 main menu categories
 */
export const MODULE_REGISTRY: LattesModule[] = [
  // ─── DADOS GERAIS ─────────────────────────────────────────
  {
    id: 'identificacao',
    name: 'Identificação',
    category: 'Dados gerais',
    route: 'prc_ident',
    type: 'form',
    menuPath: ['Dados gerais', 'Identificação'],
    description: 'Dados pessoais: nome, CPF, nacionalidade, identidade, passaporte, PCD',
  },
  {
    id: 'endereco',
    name: 'Endereço',
    category: 'Dados gerais',
    route: 'prc_endereco',
    type: 'form',
    menuPath: ['Dados gerais', 'Endereço'],
    description: 'Endereço residencial e profissional, contato e redes sociais',
  },
  {
    id: 'licenca_maternidade',
    name: 'Licença Maternidade, Paternidade e Adoção',
    category: 'Dados gerais',
    route: 'pkg_licenca.lista',
    type: 'crud-list',
    menuPath: ['Dados gerais', 'Licença Maternidade, Paternidade e Adoção'],
  },
  {
    id: 'idiomas',
    name: 'Idiomas',
    category: 'Dados gerais',
    route: 'pkg_idioma.lista',
    type: 'crud-list',
    menuPath: ['Dados gerais', 'Idiomas'],
    description: 'Idiomas e níveis de proficiência',
  },
  {
    id: 'premios',
    name: 'Prêmios e títulos',
    category: 'Dados gerais',
    route: 'pkg_premio.lista',
    type: 'crud-list',
    menuPath: ['Dados gerais', 'Prêmios e títulos'],
  },
  {
    id: 'texto_inicial',
    name: 'Texto inicial do Currículo Lattes',
    category: 'Dados gerais',
    route: 'pkg_resume.form',
    type: 'text-form',
    menuPath: ['Dados gerais', 'Texto inicial do Currículo Lattes'],
    description: 'Resumo/texto inicial do currículo em PT e EN',
  },
  {
    id: 'outras_info',
    name: 'Outras informações relevantes',
    category: 'Dados gerais',
    route: 'prc_outras_inf',
    type: 'text-form',
    menuPath: ['Dados gerais', 'Outras informações relevantes'],
  },

  // ─── FORMAÇÃO ──────────────────────────────────────────────
  {
    id: 'formacao_academica',
    name: 'Formação acadêmica/titulação',
    category: 'Formação',
    route: 'pkg_formacao.lista?f_tipo=FA',
    type: 'crud-list',
    menuPath: ['Formação', 'Formação acadêmica/titulação'],
    description: 'Graduação, mestrado, doutorado, etc.',
  },
  {
    id: 'pos_doutorado',
    name: 'Pós-doutorado e/ou livre-docência',
    category: 'Formação',
    route: 'pkg_formacao.lista?f_tipo=AP',
    type: 'crud-list',
    menuPath: ['Formação', 'Pós-doutorado e/ou livre-docência'],
  },
  {
    id: 'formacao_complementar',
    name: 'Formação complementar',
    category: 'Formação',
    route: 'pkg_formacao_compl.lista',
    type: 'crud-list',
    menuPath: ['Formação', 'Formação complementar'],
    description: 'Cursos, capacitações, certificações',
  },

  // ─── ATUAÇÃO ───────────────────────────────────────────────
  {
    id: 'atuacao_profissional',
    name: 'Atuação profissional',
    category: 'Atuação',
    route: 'pkg_ativ.lista',
    type: 'crud-list',
    menuPath: ['Atuação', 'Atuação profissional'],
    description: 'Vínculos profissionais, atividades e cargos',
  },
  {
    id: 'areas_atuacao',
    name: 'Áreas de atuação',
    category: 'Atuação',
    route: 'prc_area_atuacao',
    type: 'form',
    menuPath: ['Atuação', 'Áreas de atuação'],
  },
  {
    id: 'linhas_pesquisa',
    name: 'Linhas de pesquisa',
    category: 'Atuação',
    route: 'pkg_linhapesq.lista',
    type: 'crud-list',
    menuPath: ['Atuação', 'Linhas de pesquisa'],
  },

  // ─── PROJETOS ──────────────────────────────────────────────
  {
    id: 'projetos_pesquisa',
    name: 'Projetos de pesquisa',
    category: 'Projetos',
    route: 'pkg_projeto.lista?f_cod_tipo=P',
    type: 'crud-list',
    menuPath: ['Projetos', 'Projetos de pesquisa'],
  },
  {
    id: 'projetos_extensao',
    name: 'Projeto de extensão',
    category: 'Projetos',
    route: 'pkg_projeto.lista?f_cod_tipo=E',
    type: 'crud-list',
    menuPath: ['Projetos', 'Projeto de extensão'],
  },
  {
    id: 'projetos_ensino',
    name: 'Projeto de ensino',
    category: 'Projetos',
    route: 'pkg_projeto.lista?f_cod_tipo=N',
    type: 'crud-list',
    menuPath: ['Projetos', 'Projeto de ensino'],
  },
  {
    id: 'projetos_desenv',
    name: 'Projeto de desenvolvimento tecnológico',
    category: 'Projetos',
    route: 'pkg_projeto.lista?f_cod_tipo=D',
    type: 'crud-list',
    menuPath: ['Projetos', 'Projeto de desenvolvimento tecnológico'],
  },
  {
    id: 'outros_projetos',
    name: 'Outros projetos',
    category: 'Projetos',
    route: 'pkg_projeto.lista?f_cod_tipo=O',
    type: 'crud-list',
    menuPath: ['Projetos', 'Outros projetos'],
  },

  // ─── PRODUÇÕES ─────────────────────────────────────────────
  {
    id: 'artigos_publicados',
    name: 'Artigos completos publicados em periódicos',
    category: 'Produções',
    route: 'pkg_artigo.lista',
    type: 'crud-list',
    menuPath: ['Produções', 'Artigos completos publicados em periódicos'],
  },
  {
    id: 'artigos_aceitos',
    name: 'Artigos aceitos para publicação',
    category: 'Produções',
    route: 'pkg_artigo_pr.lista',
    type: 'crud-list',
    menuPath: ['Produções', 'Artigos aceitos para publicação'],
  },
  {
    id: 'livros_capitulos',
    name: 'Livros e capítulos',
    category: 'Produções',
    route: 'pkg_lvr_cap.lista',
    type: 'crud-list',
    menuPath: ['Produções', 'Livros e capítulos'],
  },
  {
    id: 'trabalhos_anais',
    name: 'Trabalhos publicados em anais de eventos',
    category: 'Produções',
    route: 'pkg_trabalho.lista',
    type: 'crud-list',
    menuPath: ['Produções', 'Trabalhos publicados em anais de eventos'],
  },
  {
    id: 'textos_jornais',
    name: 'Textos em jornais ou revistas',
    category: 'Produções',
    route: 'pkg_texto.lista',
    type: 'crud-list',
    menuPath: ['Produções', 'Textos em jornais ou revistas'],
  },
  {
    id: 'trabalhos_tecnicos',
    name: 'Trabalhos técnicos',
    category: 'Produções',
    route: 'pkg_relatorio.lista',
    type: 'crud-list',
    menuPath: ['Produções', 'Trabalhos técnicos'],
  },

  // ─── PATENTES E REGISTROS ──────────────────────────────────
  {
    id: 'patente',
    name: 'Patente',
    category: 'Patentes e Registros',
    route: 'PKG_PATENTE_REGISTRO.LISTA?f_cod_tipo=PP',
    type: 'crud-list',
    menuPath: ['Patentes e Registros', 'Patente'],
  },
  {
    id: 'programa_computador',
    name: 'Programa de computador registrado',
    category: 'Patentes e Registros',
    route: 'PKG_PATENTE_REGISTRO.LISTA?f_cod_tipo=PC',
    type: 'crud-list',
    menuPath: ['Patentes e Registros', 'Programa de computador registrado'],
  },

  // ─── EVENTOS ───────────────────────────────────────────────
  {
    id: 'eventos',
    name: 'Participação em eventos',
    category: 'Eventos',
    route: 'pkg_evento.lista',
    type: 'crud-list',
    menuPath: ['Eventos', 'Participação em eventos'],
  },

  // ─── ORIENTAÇÕES ───────────────────────────────────────────
  {
    id: 'orientacoes_concluidas',
    name: 'Orientações concluídas',
    category: 'Orientações',
    route: 'pkg_orient.lista?f_tipo=C',
    type: 'crud-list',
    menuPath: ['Orientações', 'Orientações concluídas'],
  },

  // ─── BANCAS ────────────────────────────────────────────────
  {
    id: 'bancas_trabalhos',
    name: 'Bancas de trabalhos de conclusão',
    category: 'Bancas',
    route: 'pkg_banca_trab.lista',
    type: 'crud-list',
    menuPath: ['Bancas', 'Bancas de trabalhos de conclusão'],
  },

  // ─── CITAÇÕES ──────────────────────────────────────────────
  {
    id: 'citacoes',
    name: 'Citações',
    category: 'Citações',
    route: 'prc_indicadores',
    type: 'indicators',
    menuPath: ['Citações'],
  },
];

/**
 * Get all unique category names
 */
export function getCategories(): string[] {
  return [...new Set(MODULE_REGISTRY.map(m => m.category))];
}

/**
 * Get modules by category
 */
export function getModulesByCategory(category: string): LattesModule[] {
  return MODULE_REGISTRY.filter(m => m.category === category);
}

/**
 * Find a module by its ID
 */
export function getModuleById(id: string): LattesModule | undefined {
  return MODULE_REGISTRY.find(m => m.id === id);
}

/**
 * Find a module by its display name (case-insensitive partial match)
 */
export function findModuleByName(name: string): LattesModule | undefined {
  const lower = name.toLowerCase();
  return MODULE_REGISTRY.find(m => m.name.toLowerCase().includes(lower));
}
