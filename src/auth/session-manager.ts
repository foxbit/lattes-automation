/**
 * Session Manager for Lattes Authentication
 * 
 * Simplified approach:
 * 1. Opens a browser pointed at the Lattes login page
 * 2. User logs in manually (gov.br, CPF, whatever method)
 * 3. System polls ALL open tabs waiting for PKG_MENU.menu to appear
 * 4. Once detected, captures that page and saves the session
 * 
 * No redirect automation, no click automation during login.
 * The user handles login entirely on their own.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

const LATTES_MENU_URL_PATTERN = 'cvlattesweb/PKG_MENU.menu';
const LATTES_LOGIN_URL = 'https://wwws.cnpq.br/cvlattesweb/pkg_login.prc_form';
const SESSION_FILE = join(process.cwd(), 'data', 'auth', 'lattes-session.json');

export interface SessionState {
  isAuthenticated: boolean;
  lastValidated: string;
  userName?: string;
  lattesUrl?: string;
}

export class SessionManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  private ensureDataDir(): void {
    const dir = dirname(SESSION_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  hasStoredSession(): boolean {
    return existsSync(SESSION_FILE);
  }

  /**
   * Opens a browser for manual login.
   * Waits until PKG_MENU.menu appears in ANY tab, then captures that page.
   */
  async loginInteractive(): Promise<Page> {
    this.ensureDataDir();

    console.log('🔐 Abrindo browser para login...');
    console.log('   Faça o login no gov.br normalmente.');
    console.log('   O sistema detectará automaticamente quando o editor do currículo abrir.\n');

    this.browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'pt-BR',
    });

    this.page = await this.context.newPage();
    await this.page.goto(LATTES_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    console.log('⏳ Aguardando login... (faça o login e navegue até o editor do currículo)');

    // Poll ALL pages in the context every 2s looking for the editor URL.
    // This handles the case where "Atualizar currículo" opens a new tab.
    const editorPage = await this.waitForEditorPage(300_000);

    // Switch to the editor page
    this.page = editorPage;

    console.log('✅ Editor do currículo detectado!');

    // Save session
    await this.context.storageState({ path: SESSION_FILE });

    // Extract user name
    const userName = await this.page.textContent('h2')
      .then(t => t?.trim())
      .catch(() => null);

    const state: SessionState = {
      isAuthenticated: true,
      lastValidated: new Date().toISOString(),
      userName: userName || undefined,
      lattesUrl: this.page.url(),
    };
    writeFileSync(
      SESSION_FILE.replace('.json', '-meta.json'),
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    console.log(`✅ Sessão salva! Usuário: ${state.userName || '(detectado)'}`);
    return this.page;
  }

  /**
   * Polls all open browser tabs looking for the Lattes editor page.
   * Returns the page as soon as it's found.
   */
  private async waitForEditorPage(timeoutMs: number): Promise<Page> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Check all pages in the context (handles new tabs/popups)
      const allPages = this.context!.pages();
      for (const page of allPages) {
        try {
          const url = page.url();
          if (url.includes(LATTES_MENU_URL_PATTERN)) {
            // Found it! Wait a moment for the page to fully load
            await page.waitForLoadState('domcontentloaded');
            return page;
          }
        } catch {
          // Page may have been closed, skip
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Timeout: O editor do currículo não foi aberto em tempo hábil. Tente novamente.');
  }

  /**
   * Tries to restore a saved session. Returns null if expired.
   */
  async restoreSession(): Promise<Page | null> {
    if (!this.hasStoredSession()) {
      console.log('⚠️  Nenhuma sessão salva. Use loginInteractive() primeiro.');
      return null;
    }

    console.log('🔄 Tentando restaurar sessão salva...');

    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      storageState: SESSION_FILE,
      viewport: { width: 1280, height: 900 },
      locale: 'pt-BR',
    });

    this.page = await this.context.newPage();

    try {
      // Try navigating directly to the editor menu. If cookies are valid, it will load.
      await this.page.goto('https://wwws.cnpq.br/cvlattesweb/PKG_MENU.menu', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await this.page.waitForTimeout(3000);

      // Check all pages (might have redirected to a new tab)
      for (const page of this.context.pages()) {
        if (page.url().includes(LATTES_MENU_URL_PATTERN)) {
          this.page = page;
          console.log('✅ Sessão restaurada!');
          await this.context.storageState({ path: SESSION_FILE });
          return this.page;
        }
      }

      console.log('⚠️  Sessão expirada. Necessário novo login.');
      return null;
    } catch {
      console.log('⚠️  Erro ao restaurar sessão.');
      return null;
    }
  }

  /**
   * Gets an authenticated page. Tries restore first, falls back to interactive login.
   */
  async getAuthenticatedPage(): Promise<Page> {
    if (this.page) {
      const isValid = await this.validateSession();
      if (isValid) return this.page;
    }

    const restored = await this.restoreSession();
    if (restored) return restored;

    return this.loginInteractive();
  }

  async validateSession(): Promise<boolean> {
    if (!this.page) return false;
    try {
      return this.page.url().includes(LATTES_MENU_URL_PATTERN);
    } catch {
      return false;
    }
  }

  getCurrentPage(): Page | null {
    return this.page;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  async close(): Promise<void> {
    if (this.context) {
      try { await this.context.storageState({ path: SESSION_FILE }); } catch {}
    }
    if (this.browser) {
      await this.browser.close();
    }
    this.page = null;
    this.context = null;
    this.browser = null;
  }
}
