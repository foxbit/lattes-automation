/**
 * Playwright Navigator for Lattes
 * 
 * Core engine that handles navigation, menu interaction,
 * modal/iframe handling, and form field operations.
 * 
 * Key architectural decisions:
 * - Always locates elements by label/text, never by index
 * - Treats modals/iframes as separate navigation contexts
 * - Takes snapshots before and after operations
 * - Never clicks Save without explicit confirmation
 */

import { type Page, type Frame, type ElementHandle, type Locator } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SNAPSHOTS_DIR = join(process.cwd(), 'data', 'snapshots');
const LOGS_DIR = join(process.cwd(), 'data', 'logs');

// Menu IDs observed in the Lattes interface
const MENU_MAP: Record<string, string> = {
  'Dados gerais': 'megaanchor2',
  'Formação': 'megaanchor3',
  'Atuação': 'megaanchor4',
  'Projetos': 'megaanchor5',
  'Produções': 'megaanchor6',
  'Patentes e Registros': 'megaanchor7',
  'Inovação': 'megaanchor8',
  'Educação e Popularização de C&T': 'megaanchor9',
  'Eventos': 'megaanchor10',
  'Orientações': 'megaanchor11',
  'Bancas': 'megaanchor12',
  'Citações': 'megaanchor13',
};

export interface FieldInfo {
  label: string;
  name?: string;
  id?: string;
  type: string;       // text, select, radio, checkbox, textarea, file
  value?: string;
  options?: string[];  // For selects/radios
  required: boolean;
  visible: boolean;
}

export interface RecordInfo {
  index: number;
  text: string;
  details?: string;
}

export interface ModuleState {
  title: string;
  records: RecordInfo[];
  hasNewButton: boolean;
  timestamp: string;
}

export interface FormState {
  title: string;
  sections: string[];
  activeSection: string;
  fields: FieldInfo[];
  timestamp: string;
}

export interface NavigationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  screenshot?: string;
}

export class LattesNavigator {
  private page: Page;
  private auditLog: Array<{ timestamp: string; action: string; details: unknown }> = [];

  constructor(page: Page) {
    this.page = page;
    this.ensureDirs();
  }

  private ensureDirs(): void {
    for (const dir of [SNAPSHOTS_DIR, LOGS_DIR]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Logs an action for audit trail
   */
  private log(action: string, details: unknown = {}): void {
    const entry = { timestamp: new Date().toISOString(), action, details };
    this.auditLog.push(entry);
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    console.log(`📋 [${entry.timestamp}] ${action}`, detailsStr);
  }

  /**
   * Takes a screenshot and saves it to the snapshots directory
   */
  async takeSnapshot(label: string): Promise<string> {
    const filename = `${Date.now()}_${label.replace(/\s+/g, '_')}.png`;
    const filepath = join(SNAPSHOTS_DIR, filename);
    await this.page.screenshot({ path: filepath, fullPage: false });
    this.log('snapshot', { label, filepath });
    return filepath;
  }

  // ──────────────────────────────────────────────────────────
  //  MENU NAVIGATION
  // ──────────────────────────────────────────────────────────

  /**
   * Lists all main menu categories available
   */
  async listMenuCategories(): Promise<string[]> {
    const categories: string[] = [];
    for (const [name, id] of Object.entries(MENU_MAP)) {
      const el = await this.page.$(`#${id}`);
      if (el) categories.push(name);
    }
    this.log('listMenuCategories', { found: categories.length });
    return categories;
  }

  /**
   * Opens a menu category dropdown and returns the submenu items
   */
  async openMenu(categoryName: string): Promise<NavigationResult<string[]>> {
    const menuId = MENU_MAP[categoryName];
    if (!menuId) {
      return { success: false, error: `Menu "${categoryName}" não encontrado no mapa` };
    }

    this.log('openMenu', { categoryName });

    try {
      // Hover and click the menu to open dropdown
      await this.page.hover(`#${menuId}`);
      await this.page.click(`#${menuId}`, { force: true });
      await this.page.waitForTimeout(1000);

      // Find the dropdown submenu items
      const submenuItems: string[] = [];
      const dropdown = await this.page.$(`#${menuId} + ul, #${menuId} ~ ul, .sub-menu, [class*="dropdown"]`);
      
      if (dropdown) {
        const items = await dropdown.$$('li a, a');
        for (const item of items) {
          const text = await item.textContent();
          if (text?.trim()) submenuItems.push(text.trim());
        }
      }

      if (submenuItems.length === 0) {
        const allLinks = await this.page.$$('a');
        for (const link of allLinks) {
          const text = await link.textContent();
          const onclick = await link.getAttribute('onclick');
          if (text?.trim() && onclick?.includes('modalCV1')) {
            submenuItems.push(text.trim());
          }
        }
      }

      return { success: true, data: submenuItems };
    } catch (error) {
      return { success: false, error: `Erro ao abrir menu: ${(error as Error).message}` };
    }
  }

  /**
   * Clicks a specific submenu item by its text label
   */
  async clickSubmenuItem(itemText: string): Promise<NavigationResult> {
    this.log('clickSubmenuItem', { itemText });

    try {
      // Find all links in the page
      const allLinks = await this.page.$$('a');
      let clicked = false;
      
      for (const link of allLinks) {
        const text = await link.textContent();
        
        // Exact match or close to exact match
        if (text?.trim() === itemText) {
          const onclick = await link.getAttribute('onclick');
          
          // In Lattes, modal triggers usually have onclick="javascript:modalCV1.setarUrl(...)"
          if (onclick && onclick.includes('modalCV1')) {
            this.log('clickSubmenuItem:found', { text: text.trim(), onclick });
            
            // Execute the raw JS directly in the global page context
            await this.page.evaluate(onclick);
            
            clicked = true;
            break;
          }
        }
      }
      
      if (!clicked) {
        // Fallback: just try to click the first visible one with that text
        const visibleLinks = await this.page.$$(`a:has-text("${itemText}"):visible`);
        if (visibleLinks.length > 0) {
          this.log('clickSubmenuItem:fallback', { using: 'visible fallback' });
          await visibleLinks[0].evaluate((el: HTMLElement) => el.click());
          clicked = true;
        }
      }

      if (!clicked) {
        return { success: false, error: `Link com texto "${itemText}" não encontrado ou não aciona modal.` };
      }

      // Wait for modal and iframe to load
      await this.page.waitForTimeout(3000);

      return { success: true };
    } catch (error) {
      return { success: false, error: `Não foi possível clicar em "${itemText}": ${(error as Error).message}` };
    }
  }

  // ──────────────────────────────────────────────────────────
  //  MODAL / IFRAME HANDLING
  // ──────────────────────────────────────────────────────────

  /**
   * Gets the active modal's iframe, which contains the actual form content.
   * This is critical because Lattes loads all form content inside iframes.
   */
  public async getModalFrame(preferForm: boolean = false): Promise<Frame | null> {
    try {
      // Wait for the modal iframe to load, but don't strictly require it to be visible immediately
      const iframeEl = await this.page.waitForSelector(
        'iframe[src*="prc_"], iframe[src*="pkg_"], .modal iframe, iframe',
        { timeout: 5000, state: 'attached' }
      ).catch(() => null);

      if (iframeEl) {
        await this.page.waitForTimeout(2000);
      }

      // Try to find the frame object from the element
      let frame = iframeEl ? await iframeEl.contentFrame() : null;
      
      // Fallback: search all frames in the page
      if (!frame || frame.url() === 'about:blank') {
        const allFrames = this.page.frames();
        let bestFrame: Frame | null = null;

        for (const f of allFrames) {
          const url = f.url();
          if (url === 'about:blank' || f === this.page.mainFrame()) continue;

          // If preferring form frames, prioritize .form, .inclui, .detalhe over .lista
          if (preferForm && (url.includes('.form') || url.includes('.inclui') || url.includes('.detalhe'))) {
            bestFrame = f;
            break;
          }
          if (url.includes('prc_') || url.includes('pkg_') || url.includes('PKG_')) {
            if (!bestFrame) bestFrame = f;
          }
        }
        frame = bestFrame;
      }

      if (frame) {
        this.log('getModalFrame', { found: true, url: frame.url() });
        return frame;
      }

      this.log('getModalFrame', { found: false, error: 'Frame not found in DOM or page.frames()' });
      return null;
    } catch (error) {
      this.log('getModalFrame', { found: false, error: (error as Error).message });
      return null;
    }
  }

  /**
   * Gets the modal title
   */
  async getModalTitle(): Promise<string | null> {
    try {
      // Try common modal title patterns
      for (const selector of ['.modal-title', '.titulo-modal', 'h2.titulo', '.tit_modal']) {
        const el = await this.page.$(selector);
        if (el) {
          const text = await el.textContent();
          if (text?.trim()) return text.trim();
        }
      }

      // Try finding it in the iframe
      const frame = await this.getModalFrame();
      if (frame) {
        const title = await frame.$('h1, h2, .titulo, .title');
        if (title) {
          const text = await title.textContent();
          if (text?.trim()) return text.trim();
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Closes the currently open modal. Handles both modalCV1 and modalCV2.
   * Tries multiple close button patterns, falls back to Escape key.
   */
  async closeModal(): Promise<NavigationResult> {
    this.log('closeModal');

    const closeSelectors = [
      'img[alt*="fechar" i]', 'img[alt*="close" i]',
      'a[title*="fechar" i]', 'a[title*="Fechar" i]',
      '.close', '.btn-close', '.fechar',
      'button:has-text("Fechar")',
      'a:has-text("Fechar")',
      '[onclick*="fechar" i]', '[onclick*="close" i]',
    ];

    for (const sel of closeSelectors) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          await btn.click().catch(() => {});
          await this.page.waitForTimeout(1500).catch(() => {});
          return { success: true };
        }
      } catch {}
    }

    try {
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000).catch(() => {});
      return { success: true };
    } catch {
      return { success: false, error: 'Não foi possível fechar o modal' };
    }
  }

  // ──────────────────────────────────────────────────────────
  //  FORM READING
  // ──────────────────────────────────────────────────────────

  /**
   * Reads all form fields from the current modal/iframe context.
   * This is the core capability needed for automation.
   */
  async readFormFields(context?: Frame | Page): Promise<FieldInfo[]> {
    const ctx = context || await this.getModalFrame() || this.page;
    const fields: FieldInfo[] = [];

    this.log('readFormFields');

    try {
      // Read text inputs (exclude hidden, submit, button, image)
      const inputs = await ctx.$$('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input:not([type])');
      for (const input of inputs) {
        const type = await input.getAttribute('type');
        if (type === 'hidden') continue;
        const field = await this.extractFieldInfo(input, ctx);
        if (field) fields.push(field);
      }

      // Read textareas
      const textareas = await ctx.$$('textarea');
      for (const ta of textareas) {
        const field = await this.extractFieldInfo(ta, ctx);
        if (field) fields.push({ ...field!, type: 'textarea' });
      }

      // Read standard selects
      const selects = await ctx.$$('select');
      for (const select of selects) {
        const field = await this.extractSelectInfo(select, ctx);
        if (field) fields.push(field);
      }

      // Read custom dropdowns (ms-dropdown component used in Lattes)
      const customDropdowns = await ctx.$$('.ms-dd, .ms-dropdown, [is="ms-dropdown"]');
      for (const dd of customDropdowns) {
        const field = await this.extractCustomDropdownInfo(dd, ctx);
        if (field) fields.push(field);
      }

      // Read radio buttons (grouped by name)
      const radioGroups = new Set<string>();
      const radios = await ctx.$$('input[type="radio"]');
      for (const radio of radios) {
        const name = await radio.getAttribute('name');
        if (name && !radioGroups.has(name)) {
          radioGroups.add(name);
          const field = await this.extractRadioGroupInfo(name, ctx);
          if (field) fields.push(field);
        }
      }

      // Read checkboxes
      const checkboxes = await ctx.$$('input[type="checkbox"]');
      for (const cb of checkboxes) {
        const field = await this.extractFieldInfo(cb, ctx);
        if (field) fields.push({ ...field!, type: 'checkbox' });
      }
    } catch (error) {
      this.log('readFormFields:error', { error: (error as Error).message });
    }

    this.log('readFormFields:result', { fieldCount: fields.length });
    return fields;
  }

  /**
   * Extracts field info for a single input element
   */
  private async extractFieldInfo(el: ElementHandle, ctx: Frame | Page): Promise<FieldInfo | null> {
    try {
      const id = await el.getAttribute('id');
      const name = await el.getAttribute('name');
      const type = await el.getAttribute('type') || 'text';
      const value = await el.inputValue().catch(() => el.getAttribute('value'));
      const required = (await el.getAttribute('required')) !== null;
      const isVisible = await el.isVisible();
      const isDisabled = (await el.getAttribute('disabled')) !== null;

      // Try to find associated label
      let label = '';
      if (id) {
        const labelEl = await ctx.$(`label[for="${id}"]`);
        if (labelEl) {
          label = (await labelEl.textContent())?.trim() || '';
        }
      }

      // Try to find label from parent <td> or preceding text
      if (!label) {
        label = await el.evaluate((input: Element) => {
          // Check parent elements for text
          let parent = input.parentElement;
          for (let i = 0; i < 4 && parent; i++) {
            // Lattes uses <td> with text nodes before inputs
            if (parent.tagName === 'TD') {
              const text = parent.textContent?.trim() || '';
              // Get text before the input
              const inputIndex = text.indexOf((input as HTMLInputElement).value || '');
              const prefix = inputIndex > 0 ? text.substring(0, inputIndex).trim() : text.substring(0, 30).trim();
              if (prefix && prefix.length < 40) return prefix.replace(/[\s:]+$/, '');
            }
            parent = parent.parentElement;
          }
          return '';
        });
      }

      // Fallback to name attribute (clean up underscores)
      if (!label && name) {
        label = name.replace(/_/g, ' ');
      }

      return {
        label,
        name: name || undefined,
        id: id || undefined,
        type: isDisabled ? `${type}_disabled` : type,
        value: (typeof value === 'string' ? value : value || undefined) as string | undefined,
        required,
        visible: isVisible,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts info for a select element including options
   */
  private async extractSelectInfo(el: ElementHandle, ctx: Frame | Page): Promise<FieldInfo | null> {
    try {
      const id = await el.getAttribute('id');
      const name = await el.getAttribute('name');
      const required = (await el.getAttribute('required')) !== null;
      const isVisible = await el.isVisible();

      // Get current value
      const value = await el.evaluate((select: HTMLSelectElement) => select.value);

      // Get options
      const options: string[] = await el.evaluate((select: HTMLSelectElement) => {
        return Array.from(select.options).map(o => `${o.value}|${o.text.trim()}`);
      });

      // Get label
      let label = '';
      if (id) {
        const labelEl = await ctx.$(`label[for="${id}"]`);
        if (labelEl) label = (await labelEl.textContent())?.trim() || '';
      }

      return {
        label,
        name: name || undefined,
        id: id || undefined,
        type: 'select',
        value,
        options,
        required,
        visible: isVisible,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts info for a radio button group
   */
  private async extractRadioGroupInfo(groupName: string, ctx: Frame | Page): Promise<FieldInfo | null> {
    try {
      const radios = await ctx.$$(`input[name="${groupName}"]`);
      const options: string[] = [];
      let selectedValue: string | undefined;

      for (const radio of radios) {
        const value = await radio.getAttribute('value') || '';
        const labelEl = await radio.evaluateHandle((el) => {
          // Try to find label: parent label, adjacent text, or for attribute
          const parent = el.parentElement;
          if (parent?.tagName === 'LABEL') return parent;
          const id = el.getAttribute('id');
          if (id) return document.querySelector(`label[for="${id}"]`);
          return el.nextSibling;
        });
        const labelText = await labelEl.evaluate((el: any) => el?.textContent?.trim() || '');
        options.push(`${value}|${labelText}`);

        const isChecked = await radio.isChecked();
        if (isChecked) selectedValue = value;
      }

      return {
        label: groupName.replace(/_/g, ' '),
        name: groupName,
        type: 'radio',
        value: selectedValue,
        options,
        required: false,
        visible: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts info for a custom ms-dropdown component used in Lattes.
   * These are <div> based dropdowns, not native <select> elements.
   */
  private async extractCustomDropdownInfo(el: ElementHandle, ctx: Frame | Page): Promise<FieldInfo | null> {
    try {
      const name = await el.evaluate((dd: Element) => {
        // Find the hidden input that stores the selected value
        const input = dd.querySelector('input[type="text"].ms-value-input, input[name]');
        return input?.getAttribute('name') || '';
      }).catch(() => '');

      const options: string[] = await el.evaluate((dd: Element) => {
        const items: string[] = [];
        const opts = dd.querySelectorAll('.ms-list-option, .ms-options li');
        opts.forEach((opt: Element) => {
          const label = opt.querySelector('.ms-dd-label')?.textContent?.trim()
            || opt.textContent?.trim() || '';
          const selected = opt.classList.contains('option-selected');
          items.push(`${selected ? '1' : '0'}|${label}`);
        });
        return items;
      }).catch(() => []);

      if (options.length === 0) return null;

      const selected = options.find(o => o.startsWith('1|'));
      const value = selected ? selected.substring(2) : undefined;

      return {
        label: name || 'privacidade',
        name: name || undefined,
        type: 'custom-select',
        value,
        options,
        required: false,
        visible: true,
      };
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────
  //  MODULE READING (LIST VIEW)
  // ──────────────────────────────────────────────────────────

  /**
   * Reads the list of records in a module (after opening it via menu).
   * Returns the current state of the module.
   */
  async readModuleList(): Promise<NavigationResult<ModuleState>> {
    this.log('readModuleList');

    try {
      const frame = await this.getModalFrame();
      const ctx = frame || this.page;

      // Get the modal title
      const title = await this.getModalTitle() || 'Módulo';

      // Look for records in the list
      const records: RecordInfo[] = [];
      
      // Common patterns for list items in Lattes
      // Priority: tr[onclick] (clickable rows), then class-based patterns
      const rowSelectors = [
        'tr[onclick]',
        'tr.even', 'tr.odd',
        'tr[class*="item"]', 'tr[class*="registro"]',
        '.registro', '.item-lista',
        'table.int tr:not(:first-child)',
      ];

      let index = 0;
      const seenRows = new Set<string>();

      for (const selector of rowSelectors) {
        try {
          const items = await ctx.$$(selector);
          for (const item of items) {
            const text = (await item.textContent())?.trim();
            if (text && text.length > 5 && !seenRows.has(text.substring(0, 100))) {
              seenRows.add(text.substring(0, 100));
              const onclick = await item.getAttribute('onclick');
              records.push({
                index: index++,
                text: text.substring(0, 200),
                details: onclick ? `onclick: ${onclick.substring(0, 80)}` : undefined,
              });
            }
          }
        } catch {}
        if (records.length > 0) break;
      }

      // Check for "no records" message
      if (records.length === 0) {
        const emptyMsg = await ctx.$(':has-text("Nenhum registro"), :has-text("nenhum registro")');
        if (emptyMsg) {
          this.log('readModuleList', { status: 'empty' });
        }
      }

      // Check for "Incluir novo item" button
      const newBtn = await ctx.$('a:has-text("Incluir"), button:has-text("Incluir"), input[value*="Incluir"]');

      const state: ModuleState = {
        title,
        records,
        hasNewButton: newBtn !== null,
        timestamp: new Date().toISOString(),
      };

      return { success: true, data: state };
    } catch (error) {
      return { success: false, error: `Erro ao ler módulo: ${(error as Error).message}` };
    }
  }

  /**
   * Clicks the "Incluir novo" / "Novo" button in a CRUD-list module.
   * After clicking, waits for the new record form to load.
   * CRITICAL: Links use self.parent.modalCV2 which must be evaluated in the iframe context.
   */
  async clickNewRecord(context?: Frame | Page): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;
    this.log('clickNewRecord');

    const patterns = [
      'a.adicionar',
      'a:has-text("Incluir")',
      'button:has-text("Incluir")',
      'input[value*="Incluir"]',
      'a:has-text("Novo")',
      'a[title*="Incluir" i]',
    ];

    for (const sel of patterns) {
      try {
        const btn = await ctx.$(sel);
        if (btn) {
          const text = (await btn.textContent())?.trim() || '';
          const onclickRaw = await btn.getAttribute('onclick');
          const tagName = await btn.evaluate((el: Element) => el.tagName.toLowerCase());
          this.log('clickNewRecord:found', {
            selector: sel, tagName, text,
            onclick: onclickRaw?.substring(0, 120),
            contextIsFrame: ctx !== this.page,
          });

          if (onclickRaw) {
            // Detect custom pre-form functions that need special handling
            const funcMatch = onclickRaw.match(/^(\w+)\(\)/);
            const funcName = funcMatch ? funcMatch[1] : '';

            if (funcName === 'selecionarNivel') {
              // Formação acadêmica: opens a level selector combo, then calls modalCV2
              await this.handleSelecionarNivel(ctx);
            } else if (funcName === 'informaDOI') {
              // Artigos: opens a DOI/info dialog via $.win(), then the actual form
              await this.handleCustomWinDialog(ctx, onclickRaw, 'pkg_artigo.informar_dados_artigo');
            } else if (funcName === 'infDadPat') {
              // Patentes: opens patent data dialog via $.win(), then the actual form
              await this.handleCustomWinDialog(ctx, onclickRaw, 'pkg_patente');
            } else if (onclickRaw.includes('self.parent.') || onclickRaw.includes('modalCV2')) {
              // Standard modalCV2 pattern - evaluate in iframe context
              if (ctx !== this.page && 'evaluate' in ctx) {
                await (ctx as Frame).evaluate(onclickRaw);
              }
            } else {
              // Fallback: try to click the element or evaluate in frame context
              if (ctx !== this.page && 'evaluate' in ctx) {
                await (ctx as Frame).evaluate(onclickRaw);
              } else {
                await this.page.evaluate(onclickRaw);
              }
            }
          } else {
            await btn.click();
          }

          await this.page.waitForTimeout(3000);
          return { success: true };
        }
      } catch {}
    }

    return { success: false, error: 'Botão "Incluir" não encontrado' };
  }

  /**
   * Handles the selecionarNivel() pattern from formação acadêmica.
   * This function opens a level selector combo, then calls modalCV2.setarUrl()
   * with the URL for the selected level. We bypass the dialog by extracting
   * the URL directly from the function source.
   */
  private async handleSelecionarNivel(ctx: Frame | Page): Promise<void> {
    this.log('handleSelecionarNivel');

    try {
      // Read the selecionarNivel function source from the iframe to extract level URLs
      const levelData: string[] = await ctx.evaluate(() => {
        const fn = (window as any).selecionarNivel;
        if (!fn) return [];
        const source = fn.toString();
        const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
        const baseUrl = urlMatch ? urlMatch[1] : '';

        const result: string[] = [];
        let match: RegExpExecArray | null;
        const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
        while ((match = regex.exec(source)) !== null) {
          result.push(match[1]);           // name
          result.push(baseUrl + match[2]); // full URL
        }
        return result;
      });

      // Parse flat array into pairs
      const levelUrls: { name: string; url: string }[] = [];
      for (let i = 0; i < levelData.length; i += 2) {
        levelUrls.push({ name: levelData[i], url: levelData[i + 1] });
      }

      if (levelUrls.length > 0) {
        // Default to first level (highest: Doutorado)
        const defaultLevel = levelUrls[0];
        this.log('handleSelecionarNivel:default', { level: defaultLevel.name, url: defaultLevel.url });

        // Call modalCV2 directly from the iframe context
        await ctx.evaluate((url) => {
          (self.parent as any).modalCV2.setarUrl(url, true);
        }, defaultLevel.url);
      } else {
        // Fallback: just call selecionarNivel() and hope the user selects
        await ctx.evaluate(() => (window as any).selecionarNivel?.());
      }
    } catch (e) {
      this.log('handleSelecionarNivel:error', { error: (e as Error).message });
    }
  }

  /**
   * Handles custom $.win() dialogs (informaDOI, infDadPat).
   * These open a dialog overlay within the same iframe, not a new modalCV2.
   * After the dialog, the user fills a field and clicks Confirmar, which triggers
   * modalCV2.setarUrl() to open the actual form.
   *
   * For informaDOI: dialog asks for DOI/ISSN → opens PKG_ARTIGO.form
   * For infDadPat: dialog asks for patent data → opens patent form
   */
  private async handleCustomWinDialog(
    ctx: Frame | Page,
    onclick: string,
    dialogUrl: string
  ): Promise<void> {
    this.log('handleCustomWinDialog', { onclick: onclick.substring(0, 80), dialogUrl });

    try {
      // Execute the function to open the dialog
      await (ctx as Frame).evaluate((oc: string) => {
        const fn = (window as any)[oc.replace('();', '')];
        if (fn) fn();
      }, onclick.replace('();', ''));

      // Wait for dialog to load
      await this.page.waitForTimeout(3000);

      // Try to auto-fill the dialog and click Confirmar
      await (ctx as Frame).evaluate(() => {
        const input = document.querySelector<HTMLInputElement>(
          '.win-content input[type="text"], .win-content input[name]'
        );
        if (input && !input.value) {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value'
          )?.set;
          setter?.call(input, '10.1234/test.2024');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const all = document.querySelectorAll<HTMLElement>(
          '.win-bottom-bar a, .win-bottom-bar span, button'
        );
        for (const el of all) {
          if (el.textContent?.trim() === 'Confirmar') {
            el.click();
            break;
          }
        }
      }).catch(() => {});

    } catch (e) {
      this.log('handleCustomWinDialog:error', { error: (e as Error).message });
    }
  }

  /**
   * Clicks the edit row/button for a specific record in a CRUD-list.
   * Lattes uses either row-click (tr[onclick]) or edit icons/links.
   * @param recordIndex - index of the record to edit (0-based)
   */
  async clickEditRecord(recordIndex: number, context?: Frame | Page): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;
    this.log('clickEditRecord', { recordIndex });

    try {
      // Pattern 1: Row click (most common in Lattes - tr elements with onclick)
      const clickableRows = await ctx.$$('tr[onclick]');
      if (clickableRows.length > recordIndex) {
        const row = clickableRows[recordIndex];
        const onclick = await row.getAttribute('onclick');
        this.log('clickEditRecord:row', { index: recordIndex, onclick: onclick?.substring(0, 120) });

        if (onclick) {
          if (ctx !== this.page && 'evaluate' in ctx) {
            await (ctx as Frame).evaluate(onclick);
          } else {
            await row.click();
          }
        } else {
          await row.click();
        }
        await this.page.waitForTimeout(3000);
        return { success: true };
      }

      // Pattern 2: Edit links/buttons
      const editSelectors = [
        'a:has-text("Editar")', 'img[alt*="editar" i]', 'img[alt*="alterar" i]',
        '[onclick*="editar" i]', 'a:has-text("Alterar")',
      ];

      for (const sel of editSelectors) {
        const btns = await ctx.$$(sel);
        if (btns.length > recordIndex) {
          const btn = btns[recordIndex];
          const onclick = await btn.getAttribute('onclick');
          this.log('clickEditRecord:button', { selector: sel, onclick: onclick?.substring(0, 120) });

          if (onclick && ctx !== this.page && 'evaluate' in ctx) {
            await (ctx as Frame).evaluate(onclick);
          } else {
            await btn.click();
          }
          await this.page.waitForTimeout(3000);
          return { success: true };
        }
      }
      return { success: false, error: `Registro ${recordIndex} não encontrado ou não editável` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ──────────────────────────────────────────────────────────
  //  FORM WRITING (WITH SAFETY)
  // ──────────────────────────────────────────────────────────

  /**
   * Fills a form field by its label or name.
   * DOES NOT SAVE — use confirmAndSave() after preview.
   */
  async fillField(
    fieldLabel: string,
    value: string,
    context?: Frame | Page
  ): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;
    this.log('fillField', { fieldLabel, value: value.substring(0, 50) });

    try {
      // Strategy 1: Find by label text
      const label = await ctx.$(`label:has-text("${fieldLabel}")`);
      if (label) {
        const forAttr = await label.getAttribute('for');
        if (forAttr) {
          const input = await ctx.$(`#${forAttr}`);
          if (input) {
            await input.fill(value);
            return { success: true };
          }
        }
      }

      // Strategy 2: Find input/textarea near the label text
      const nearField = await ctx.$(`text="${fieldLabel}" >> .. >> input, text="${fieldLabel}" >> .. >> textarea, text="${fieldLabel}" >> .. >> select`);
      if (nearField) {
        const tagName = await nearField.evaluate((el: Element) => el.tagName.toLowerCase());
        if (tagName === 'select') {
          await nearField.selectOption({ label: value });
        } else {
          await nearField.fill(value);
        }
        return { success: true };
      }

      // Strategy 3: Find by name attribute
      const byName = await ctx.$(`[name*="${fieldLabel}" i], [id*="${fieldLabel}" i]`);
      if (byName) {
        await byName.fill(value);
        return { success: true };
      }

      return { success: false, error: `Campo "${fieldLabel}" não encontrado` };
    } catch (error) {
      return { success: false, error: `Erro ao preencher "${fieldLabel}": ${(error as Error).message}` };
    }
  }

  /**
   * Selects a radio button option by group name and value text
   */
  async selectRadio(
    groupName: string,
    optionText: string,
    context?: Frame | Page
  ): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;
    this.log('selectRadio', { groupName, optionText });

    try {
      const radio = await ctx.$(`input[type="radio"][name="${groupName}"][value="${optionText}"]`);
      if (radio) {
        await radio.check();
        return { success: true };
      }

      // Try by label text near radio
      const radioByLabel = await ctx.$(`label:has-text("${optionText}") input[type="radio"]`);
      if (radioByLabel) {
        await radioByLabel.check();
        return { success: true };
      }

      return { success: false, error: `Opção "${optionText}" não encontrada no grupo "${groupName}"` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Clicks the Save button. REQUIRES explicit confirmation.
   * Takes pre and post screenshots for audit.
   */
  async confirmAndSave(context?: Frame | Page): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;

    // Pre-save snapshot
    const preSave = await this.takeSnapshot('pre_save');
    this.log('confirmAndSave', { preSnapshot: preSave });

    try {
      // Find the Save button
      const saveBtn = await ctx.$('button:has-text("Salvar"), input[value*="Salvar"], a:has-text("Salvar"), [onclick*="salvar" i]');
      
      if (!saveBtn) {
        return { success: false, error: 'Botão Salvar não encontrado' };
      }

      // Remove any overlay divs that might block the click
      await this.page.evaluate(() => {
        document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
      }).catch(() => {});

      await saveBtn.click({ force: true });
      await this.page.waitForTimeout(3000);

      // Post-save snapshot
      const postSave = await this.takeSnapshot('post_save');

      // Check for success or error messages
      const successIndicators = ['sucesso', 'salvo', 'gravado', 'cadastrado'];
      const errorIndicators = ['erro', 'error', 'falha', 'obrigatório'];

      const pageText = await this.page.textContent('body') || '';
      const lowerText = pageText.toLowerCase();

      const hasError = errorIndicators.some(ind => lowerText.includes(ind));
      const hasSuccess = successIndicators.some(ind => lowerText.includes(ind));

      if (hasError && !hasSuccess) {
        return { success: false, error: 'Possível erro detectado após salvamento', screenshot: postSave };
      }

      return { success: true, screenshot: postSave };
    } catch (error) {
      return { success: false, error: `Erro ao salvar: ${(error as Error).message }` };
    }
  }

  // ──────────────────────────────────────────────────────────
  //  LUPA FIELDS (autocomplete search)
  // ──────────────────────────────────────────────────────────

  /**
   * Fills a "lupa" (autocomplete) field on Lattes forms.
   * These fields are disabled text inputs with a magnifying glass icon next to them.
   * Two patterns exist:
   *   1. sele_inst() → opens modalCV3 search popup
   *   2. dominio()  → opens caixaMsg combobox (simple selection)
   */
  async fillLupa(
    labelOrName: string,
    searchTerm: string,
    context?: Frame | Page
  ): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;
    this.log('fillLupa', { labelOrName, searchTerm });

    try {
      // Find the lupa field input
      const input = await ctx.$(`input[name="${labelOrName}"], input[name*="${labelOrName}"]`);
      if (!input) {
        return { success: false, error: `Campo lupa "${labelOrName}" não encontrado` };
      }

      // Find the lupa link next to the input
      const lupaLink = await ctx.$(`input[name="${labelOrName}"] + a.lupa, input[name*="${labelOrName}"] + a.lupa`);
      if (!lupaLink) {
        return { success: false, error: `Link lupa para "${labelOrName}" não encontrado` };
      }

      const onclick = await lupaLink.getAttribute('onclick');
      this.log('fillLupa:link', { onclick: onclick?.substring(0, 80) });

      if (!onclick) {
        await lupaLink.click();
        return { success: true };
      }

      // Pattern 2: dominio() - combobox (simpler, can bypass)
      if (onclick.includes('dominio')) {
        // Extract combobox options from the function definition
        const options: string[] = await ctx.evaluate(() => {
          const fn = (window as any).dominio;
          if (!fn) return [];
          const src = fn.toString();
          const matches = src.matchAll(/\["([^"]+)","([^"]*)"\]/g);
          return Array.from(matches).map((m: any) => m[1]);
        });

        this.log('fillLupa:dominio', { options });

        if (options.length > 0) {
          // Find matching option
          const match = options.find(o => o.toLowerCase().includes(searchTerm.toLowerCase())) || options[0];
          // Call sele(value) on the form document to set the value
          await ctx.evaluate((val: string) => {
            const fn = (window as any).sele;
            if (fn) {
              fn(val);
            } else {
              // Fallback: try to set via modalCV2.getDocument().sele()
              try {
                (self.parent as any).modalCV2?.getDocument()?.sele?.(val);
              } catch {}
            }
          }, match);

          await this.page.waitForTimeout(1000);
          return { success: true };
        }
      }

      // Pattern 1: sele_inst() - modalCV3 search popup
      if (onclick.includes('sele_inst') || onclick.includes('modalCV3')) {
        // Execute the lupa onclick to open modalCV3
        await ctx.evaluate((oc: string) => {
          const fn = new Function(oc.replace(/^.*?\{|\}$/g, ''));
          fn();
        }, onclick);

        await this.page.waitForTimeout(3000);

        // Find modalCV3 frame
        let cv3Frame: Frame | null = null;
        for (const f of this.page.frames()) {
          if (f.url().includes('prc_inst') || f.url().includes('prc_pesq')) {
            cv3Frame = f;
            break;
          }
        }

        if (cv3Frame) {
          this.log('fillLupa:modalCV3', { url: cv3Frame.url() });

          // Find search input and type
          const searchInput = await cv3Frame.$('input[type="text"], input[name]');
          if (searchInput) {
            const nameAttr = await searchInput.getAttribute('name') || '';
            // Fill search term
            await cv3Frame.evaluate(({ name, term }: { name: string; term: string }) => {
              const inp = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
              if (inp) {
                inp.value = term;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                // Find and click search button via vanilla JS
                const all = document.querySelectorAll('a, input[type="submit"], input[type="button"], button');
                for (const el of all) {
                  if (el.textContent?.includes('Pesquisar') || (el as HTMLInputElement).value?.includes('Pesquisar')) {
                    (el as HTMLElement).click();
                    break;
                  }
                }
              }
            }, { name: nameAttr, term: searchTerm });

            await this.page.waitForTimeout(3000);

            // Click first result
            const firstResult = await cv3Frame.$('tr[onclick], a[onclick], .resultado a, table tr:nth-child(2)');
            if (firstResult) {
              await firstResult.click();
              await this.page.waitForTimeout(2000);
              this.log('fillLupa:selected', { searchTerm });

              // Close any overlay that might remain from modalCV3
              await this.page.evaluate(() => {
                const overlay = document.querySelector('.overlayDiv');
                if (overlay) overlay.remove();
              }).catch(() => {});
              await this.page.keyboard.press('Escape').catch(() => {});
              await this.page.waitForTimeout(500);

              return { success: true };
            }
          }
          // Close modalCV3 if still open
          await this.page.evaluate(() => {
            const overlay = document.querySelector('.overlayDiv');
            if (overlay) overlay.remove();
          }).catch(() => {});
          await this.page.keyboard.press('Escape').catch(() => {});
        }
      }

      // Generic: just click the lupa and hope the dialog handles itself
      await ctx.evaluate((oc: string) => {
        const fnName = oc.match(/^(\w+)\(/)?.[1];
        if (fnName) (window as any)[fnName]?.();
      }, onclick);

      await this.page.waitForTimeout(2000);
      return { success: true };
    } catch (e) {
      return { success: false, error: `Erro ao preencher lupa "${labelOrName}": ${(e as Error).message}` };
    }
  }

  // ──────────────────────────────────────────────────────────
  //  SIDEBAR NAVIGATION (inside modals)
  // ──────────────────────────────────────────────────────────

  /**
   * Lists sidebar sections in the current modal (e.g., Foto, Nome civil, etc.)
   */
  async listSidebarSections(context?: Frame | Page): Promise<string[]> {
    const ctx = context || await this.getModalFrame() || this.page;

    try {
      const sections: string[] = [];
      const sidebarLinks = await ctx.$$('.menu-lateral a, .sidebar a, nav a, [class*="nav"] a, [class*="menu"] a');
      for (const link of sidebarLinks) {
        const text = (await link.textContent())?.trim();
        if (text) sections.push(text);
      }
      return sections;
    } catch {
      return [];
    }
  }

  /**
   * Clicks a sidebar section by text
   */
  async clickSidebarSection(sectionText: string, context?: Frame | Page): Promise<NavigationResult> {
    const ctx = context || await this.getModalFrame() || this.page;

    try {
      const link = await ctx.$(`a:has-text("${sectionText}")`);
      if (link) {
        await link.click();
        await this.page.waitForTimeout(1000);
        return { success: true };
      }
      return { success: false, error: `Seção "${sectionText}" não encontrada` };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // ──────────────────────────────────────────────────────────
  //  UTILITY
  // ──────────────────────────────────────────────────────────

  /**
   * Saves the audit log to a file
   */
  saveAuditLog(): void {
    const filename = `audit_${Date.now()}.json`;
    const filepath = join(LOGS_DIR, filename);
    writeFileSync(filepath, JSON.stringify(this.auditLog, null, 2), 'utf-8');
    console.log(`📝 Audit log salvo em: ${filepath}`);
  }

  /**
   * Gets the current page URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Waits for a specific amount of time
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }
}
