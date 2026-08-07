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
  async getModalFrame(): Promise<Frame | null> {
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
        for (const f of allFrames) {
          const url = f.url();
          if (url.includes('prc_') || url.includes('pkg_') || (url !== 'about:blank' && f !== this.page.mainFrame())) {
            frame = f;
            break;
          }
        }
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
   * Closes the currently open modal
   */
  async closeModal(): Promise<NavigationResult> {
    this.log('closeModal');

    try {
      // Try various close button patterns
      const closeSelectors = [
        'img[alt*="fechar"], img[alt*="Fechar"]',
        'img[alt*="close"], img[alt*="Close"]',
        'a[title*="fechar"], a[title*="Fechar"]',
        '.close, .btn-close',
        'button:has-text("Fechar")',
        '[onclick*="fechar"], [onclick*="close"]',
      ];

      for (const sel of closeSelectors) {
        const btn = await this.page.$(sel);
        if (btn) {
          await btn.click();
          await this.page.waitForTimeout(1000);
          return { success: true };
        }
      }

      // If nothing found, try Escape key
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000);
      return { success: true };
    } catch (error) {
      return { success: false, error: `Erro ao fechar modal: ${(error as Error).message}` };
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
      // Read text inputs
      const inputs = await ctx.$$('input[type="text"], input[type="email"], input[type="number"], input[type="tel"], input:not([type])');
      for (const input of inputs) {
        const field = await this.extractFieldInfo(input, ctx);
        if (field) fields.push(field);
      }

      // Read textareas
      const textareas = await ctx.$$('textarea');
      for (const ta of textareas) {
        const field = await this.extractFieldInfo(ta, ctx);
        if (field) fields.push({ ...field!, type: 'textarea' });
      }

      // Read selects
      const selects = await ctx.$$('select');
      for (const select of selects) {
        const field = await this.extractSelectInfo(select, ctx);
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

      // Try to find associated label
      let label = '';
      if (id) {
        const labelEl = await ctx.$(`label[for="${id}"]`);
        if (labelEl) {
          label = (await labelEl.textContent())?.trim() || '';
        }
      }
      if (!label && name) {
        label = name;
      }

      return {
        label,
        name: name || undefined,
        id: id || undefined,
        type,
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
        label: groupName,
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
      const listItems = await ctx.$$('tr[class*="item"], tr[class*="registro"], .registro, .item-lista, table tr:not(:first-child)');
      let index = 0;
      for (const item of listItems) {
        const text = (await item.textContent())?.trim();
        if (text) {
          records.push({ index: index++, text: text.substring(0, 200) });
        }
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

      await saveBtn.click();
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
