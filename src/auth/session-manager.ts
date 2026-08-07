/**
 * Session Manager for Lattes Authentication
 * 
 * Two login modes:
 * 
 * 1. Automatic (server mode): Uses GOVBR_CPF and GOVBR_SENHA from .env
 *    to fill the gov.br login form via Playwright (headless).
 *    Falls back to interactive if 2FA is required or credentials are missing.
 * 
 * 2. Interactive (GUI mode): Opens a browser for manual login.
 *    The user handles gov.br authentication on their own.
 *    System polls all tabs waiting for PKG_MENU.menu to appear.
 * 
 * Session cookies are persisted to data/auth/lattes-session.json
 * for reuse across restarts.
 */

import { config } from 'dotenv';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execFileSync } from 'child_process';

// ── Encrypted env support ────────────────────────────────────────────
// If .env.age exists and AGE_KEY_FILE is set, decrypt credentials at
// runtime so the plaintext .env never touches disk.
function loadEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
  const encPath = resolve(process.cwd(), '.env.age');
  const ageKeyFile = process.env.AGE_KEY_FILE || resolve(process.env.HOME || '/root', '.age', 'lattes-key.txt');

  if (existsSync(encPath) && existsSync(ageKeyFile)) {
    try {
      const decrypted = execFileSync('age', ['-d', '-i', ageKeyFile, encPath], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      for (const line of decrypted.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      console.error('🔐 Credenciais descriptografadas de .env.age');
      return;
    } catch (err) {
      console.error(`⚠️  Falha ao descriptografar .env.age: ${(err as Error).message}`);
      console.error('   Tentando fallback para .env...');
    }
  }

  // Fallback: plain .env
  config({ path: envPath });
}

loadEnv();

const LATTES_MENU_URL_PATTERN = 'cvlattesweb/PKG_MENU.menu';
const PORTAL_LATTES_URL = 'https://memoria.cnpq.br/web/portal-lattes/';
const CNPQ_KEYCLOAK_PATTERN = 'login.cnpq.br';
const GOVBR_SSO_PATTERN = 'sso.acesso.gov.br';
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
    await this.page.goto('https://login.cnpq.br/auth/realms/cnpq/protocol/openid-connect/auth?client_id=lattes', { waitUntil: 'domcontentloaded' });

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
   * Attempts automatic login using credentials from .env (GOVBR_CPF and GOVBR_SENHA).
   * 
   * Flow: Portal Lattes → CNPq Keycloak (CPF + password) → editor Lattes.
   * If the account uses gov.br SSO, clicks "Entrar com gov.br" instead.
   * 
   * Runs headless by default (server environments).
   * Falls back if 2FA is required or credentials are missing.
   */
  async loginAutomatico(): Promise<Page> {
    this.ensureDataDir();

    const cpf = process.env.GOVBR_CPF?.trim();
    const senha = process.env.GOVBR_SENHA?.trim();

    if (!cpf || !senha) {
      throw new Error(
        'GOVBR_CPF e GOVBR_SENHA não configurados no .env. ' +
        'Copie .env.example para .env e preencha suas credenciais.'
      );
    }

    console.log('🤖 Tentando login automático...');

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'pt-BR',
    });

    this.page = await this.context.newPage();

    // Step 1: Navigate to Portal Lattes and click the login link
    await this.page.goto(PORTAL_LATTES_URL, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000);

    const loginLink = this.page.locator('a[href*="cvlattesweb/pkg_login.prc_form"]').first();
    await loginLink.waitFor({ state: 'visible', timeout: 10_000 });
    console.log('   Clicando no link de acesso ao currículo...');
    await loginLink.click();

    // Step 2: Wait for CNPq Keycloak login page
    await this.page.waitForURL(new RegExp(CNPQ_KEYCLOAK_PATTERN), { timeout: 15_000 });
    await this.page.waitForTimeout(2000);

    // Check if redirected to gov.br instead
    const currentUrl = this.page.url();
    if (currentUrl.includes(GOVBR_SSO_PATTERN)) {
      return this.govbrSsoLogin(cpf, senha);
    }

    // Step 3: CNPq Keycloak login (CPF → password)
    // Note: The "Entrar com gov.br" button is always present on the Keycloak page,
    // but we always try CNPq Keycloak direct login first. Only redirect to gov.br
    // if Keycloak itself redirects us there.
    console.log('   Preenchendo CPF...');
    const cpfInput = this.page.locator('#accountId');
    await cpfInput.waitFor({ state: 'visible', timeout: 10_000 });
    await cpfInput.click();
    await cpfInput.fill(cpf);

    const continuarBtn = this.page.locator('button:has-text("Continuar")').first();
    await continuarBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await continuarBtn.click();
    await this.page.waitForTimeout(5000);

    // Check if redirected to gov.br
    if (this.page.url().includes(GOVBR_SSO_PATTERN)) {
      return this.govbrSsoLogin(cpf, senha);
    }

    // Password field should appear on Keycloak
    console.log('   Preenchendo senha...');
    const senhaInput = this.page.locator('#password, input[type="password"]').first();
    await senhaInput.waitFor({ state: 'visible', timeout: 15_000 });
    await senhaInput.click();
    await senhaInput.fill(senha);

    const entrarBtn = this.page.locator(
      'button[type="submit"]:has-text("Entrar"), button:has-text("Entrar"), input[type="submit"]'
    ).first();
    await entrarBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await entrarBtn.click();
    await this.page.waitForTimeout(3000);

    // Some accounts may have 2FA on Keycloak — check if we got redirected to gov.br after password
    if (this.page.url().includes(GOVBR_SSO_PATTERN)) {
      console.log('   Redirecionado para gov.br após senha (2FA requerido).');
      return this.govbrSsoLogin(cpf, senha);
    }

    console.log('⏳ Aguardando redirecionamento para o editor...');

    // Step 5: Wait for Lattes editor page
    const editorPage = await this.waitForEditorPage(60_000);
    this.page = editorPage;

    await this.saveSession();
    return this.page;
  }

  /**
   * Login via gov.br SSO (redirected from CNPq Keycloak).
   */
  private async govbrSsoLogin(cpf: string, senha: string): Promise<Page> {
    if (!this.page) throw new Error('Page not initialized');
    console.log('   Preenchendo CPF no gov.br...');
    await this.page.waitForTimeout(3000);

    const cpfInput = this.page.locator(
      '#accountId, input[name="username"], input[name="login"], input[type="text"]:visible'
    ).first();
    await cpfInput.waitFor({ state: 'visible', timeout: 10_000 });
    await cpfInput.click();
    await cpfInput.fill(cpf);

    const continuarBtn = this.page.locator(
      'button[type="submit"]:has-text("Continuar"), button:has-text("Continuar"), input[type="submit"][value="Continuar"]'
    ).first();
    await continuarBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await continuarBtn.click();
    await this.page.waitForTimeout(3000);

    console.log('   Preenchendo senha no gov.br...');
    const senhaInput = this.page.locator('#password, input[name="password"], input[type="password"]').first();
    await senhaInput.waitFor({ state: 'visible', timeout: 10_000 });
    await senhaInput.click();
    await senhaInput.fill(senha);

    const entrarBtn = this.page.locator(
      'button[type="submit"]:has-text("Entrar"), button:has-text("Entrar"), input[type="submit"][value="Entrar"]'
    ).first();
    await entrarBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await entrarBtn.click();

    console.log('⏳ Aguardando redirecionamento para o editor...');

    // gov.br redirects back to CNPq → Lattes. Wait for editor.
    const editorPage = await this.waitForEditorPage(60_000);
    this.page = editorPage;

    await this.saveSession();
    return this.page;
  }

  /**
   * Saves session state and metadata after successful login.
   */
  private async saveSession(): Promise<void> {
    await this.context!.storageState({ path: SESSION_FILE });

    const userName = await this.page!.textContent('h2')
      .then(t => t?.trim())
      .catch(() => null);

    const state: SessionState = {
      isAuthenticated: true,
      lastValidated: new Date().toISOString(),
      userName: userName || undefined,
      lattesUrl: this.page!.url(),
    };
    writeFileSync(
      SESSION_FILE.replace('.json', '-meta.json'),
      JSON.stringify(state, null, 2),
      'utf-8'
    );

    console.log(`✅ Login automático concluído! Usuário: ${state.userName || '(detectado)'}`);
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
   * Gets an authenticated page.
   * Priority: existing session > restored session > automatic login (if credentials in .env) > interactive login.
   */
  async getAuthenticatedPage(): Promise<Page> {
    if (this.page) {
      const isValid = await this.validateSession();
      if (isValid) return this.page;
    }

    const restored = await this.restoreSession();
    if (restored) return restored;

    if (process.env.GOVBR_CPF && process.env.GOVBR_SENHA) {
      try {
        return await this.loginAutomatico();
      } catch (err) {
        console.log(`⚠️  Login automático falhou: ${(err as Error).message}`);
        console.log('   Tentando login interativo como fallback...');
      }
    }

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
