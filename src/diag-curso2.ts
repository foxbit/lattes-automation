/**
 * DIAGNÓSTICO: como abrir o modal de curso
 * Uso: npx tsx src/diag-curso2.ts
 */

import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame, Page } from 'playwright';

async function findFormFrame(page: Page, listUrl: string): Promise<Frame | null> {
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    for (const f of page.frames()) {
      const url = f.url();
      if (url !== listUrl && url !== page.mainFrame().url() && url !== 'about:blank'
        && (url.includes('.form') || url.includes('pkg_formacao'))) {
        return f;
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔬 DIAG 2: abrir modal de curso\n');
  
  const session = new SessionManager();
  const page = await session.getAuthenticatedPage();
  const nav = new LattesNavigator(page);
  
  await nav.openMenu('Formação');
  await page.waitForTimeout(2000);
  await nav.clickSubmenuItem('Formação acadêmica/titulação');
  await page.waitForTimeout(5000);
  
  let listFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('pkg_formacao')) { listFrame = f; break; }
  }
  if (!listFrame) { console.log('❌ Lista'); await session.close(); return; }
  
  const levelData = await listFrame.evaluate(() => {
    const fn = (window as any).selecionarNivel;
    if (!fn) return null;
    const source = fn.toString();
    const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
    const baseUrl = urlMatch ? urlMatch[1] : '';
    const result: Array<{ name: string; url: string }> = [];
    const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      result.push({ name: match[1], url: baseUrl + match[2] });
    }
    return result;
  });
  
  const aperf = levelData?.find(l => l.name.toLowerCase().includes('aperfeiçoamento'));
  if (!aperf) { console.log('❌ Aperfeiçoamento'); await session.close(); return; }
  
  await listFrame.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, aperf.url);
  await page.waitForTimeout(5000);
  
  const formFrame = await findFormFrame(page, listFrame.url());
  if (!formFrame) { console.log('❌ Form'); await session.close(); return; }
  
  // Selecionar UFPR primeiro
  console.log('🏫 UFPR...');
  await nav.fillLupa('f_inst', 'Universidade Federal do Paraná', formFrame);
  
  // MÉTODO 1: chamar função curso() via evaluate
  console.log('\n🔧 Método 1: curso() via evaluate...');
  await formFrame.evaluate(() => {
    try { (window as any).curso(); } catch (e) { return String(e); }
  });
  await page.waitForTimeout(3000);
  let cursoModalOpen = page.frames().some(f => f.url().includes('prc_curso') || f.url().toLowerCase().includes('curso'));
  console.log(`   Modal curso aberto? ${cursoModalOpen}`);
  if (cursoModalOpen) {
    console.log('   ✅ FUNCIONA!');
    await session.close();
    return;
  }
  
  // Fechar qualquer modal residual
  await page.evaluate(() => {
    document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay, .win-overlay').forEach(el => el.remove());
  }).catch(() => {});
  await page.waitForTimeout(1000);
  
  // MÉTODO 2: clicar no segundo a.lupa (curso)
  console.log('\n🔧 Método 2: clicar no 2º a.lupa...');
  const lupas = await formFrame.$$('a.lupa');
  console.log(`   Total lupas: ${lupas.length}`);
  if (lupas.length >= 2) {
    await lupas[1].click().catch(e => console.log(`   click erro: ${(e as Error).message}`));
    await page.waitForTimeout(3000);
    cursoModalOpen = page.frames().some(f => f.url().includes('prc_curso') || f.url().toLowerCase().includes('curso'));
    console.log(`   Modal curso aberto? ${cursoModalOpen}`);
    if (cursoModalOpen) {
      console.log('   ✅ FUNCIONA!');
      const cursoFrame = page.frames().find(f => f.url().includes('prc_curso') || f.url().toLowerCase().includes('curso'));
      if (cursoFrame) {
        const info = await cursoFrame.evaluate(() => {
          const body = document.body.textContent || '';
          return {
            body: body.substring(0, 500),
            inputs: Array.from(document.querySelectorAll('input')).map(i => ({
              name: (i as HTMLInputElement).name, type: (i as HTMLInputElement).type,
            })),
            links: Array.from(document.querySelectorAll('a')).map(a => ({
              text: (a.textContent || '').trim().substring(0, 60),
              onclick: a.getAttribute('onclick'),
            })).filter(x => x.text || x.onclick),
          };
        });
        console.log('   Conteúdo:', info.body.substring(0, 200));
        console.log('   Inputs:', JSON.stringify(info.inputs));
        console.log('   Links:', JSON.stringify(info.links.slice(0, 10), null, 2));
      }
      await session.close();
      return;
    }
  }
  
  // MÉTODO 3: clicar via JS no segundo a.lupa
  console.log('\n🔧 Método 3: click() via JS no 2º a.lupa...');
  const clicked = await formFrame.evaluate(() => {
    const lupas = document.querySelectorAll('a.lupa');
    if (lupas.length >= 2) {
      (lupas[1] as HTMLElement).click();
      return lupas[1].outerHTML;
    }
    return null;
  });
  console.log(`   Elemento: ${clicked}`);
  await page.waitForTimeout(3000);
  cursoModalOpen = page.frames().some(f => f.url().includes('prc_curso') || f.url().toLowerCase().includes('curso'));
  console.log(`   Modal curso aberto? ${cursoModalOpen}`);
  
  await nav.takeSnapshot('diag_curso2');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
