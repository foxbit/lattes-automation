/**
 * DIAGNÓSTICO: modal "Consultar Cursos" no form de aperfeiçoamento
 * Uso: npx tsx src/diag-curso.ts
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
  console.log('🔬 DIAG: modal Consultar Cursos\n');
  
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
  
  // Preencher instituição UFPR
  console.log('🏫 Selecionando UFPR...');
  const lupaInst = await nav.fillLupa('f_inst', 'Universidade Federal do Paraná', formFrame);
  const instVal = await formFrame.evaluate(() =>
    (document.querySelector('input[name="f_inst"]') as HTMLInputElement)?.value || null);
  console.log(`   f_inst = "${instVal}"`);
  
  // Abrir lupa de curso (curso())
  console.log('\n🎓 Abrindo lupa de curso...');
  await formFrame.evaluate(() => {
    const el = document.querySelector('a[onclick*="curso"]') as HTMLElement;
    if (el) el.click();
    else {
      // tenta função global
      (window as any).curso?.();
    }
  });
  await page.waitForTimeout(4000);
  
  // Listar frames
  console.log('\n📋 Frames abertos:');
  for (const f of page.frames()) {
    console.log(`   • ${f.url()}`);
  }
  
  // Procurar modal de curso
  let cursoFrame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_curso') || f.url().includes('curso')) { cursoFrame = f; break; }
  }
  
  if (cursoFrame) {
    console.log(`\n✅ Modal curso: ${cursoFrame.url()}`);
    
    const info = await cursoFrame.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        body: body.substring(0, 800),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({
          name: (i as HTMLInputElement).name,
          type: (i as HTMLInputElement).type,
          value: ((i as HTMLInputElement).value || '').substring(0, 40),
        })),
        links: Array.from(document.querySelectorAll('a')).map(a => ({
          text: (a.textContent || '').trim().substring(0, 80),
          onclick: a.getAttribute('onclick'),
        })).filter(x => x.text || x.onclick),
        buttons: Array.from(document.querySelectorAll('input[type="button"], button')).map(b => ({
          value: (b as HTMLInputElement).value || (b.textContent || '').trim(),
          onclick: b.getAttribute('onclick'),
        })),
      };
    });
    
    console.log('\n📋 Conteúdo do modal:');
    console.log(`   ${info.body.substring(0, 300)}`);
    console.log('\n   Inputs:', JSON.stringify(info.inputs, null, 2));
    console.log('\n   Links:', JSON.stringify(info.links, null, 2));
    console.log('\n   Botões:', JSON.stringify(info.buttons, null, 2));
    
    // Testar cadastro de novo curso: procurar link "cadastrar novo curso"
    const cadastrarLink = await cursoFrame.$('a:has-text("cadastrar novo curso"), a:has-text("Cadastrar novo")');
    if (cadastrarLink) {
      console.log('\n🆕 Clicando "cadastrar novo curso"...');
      await cadastrarLink.click();
      await page.waitForTimeout(3000);
      
      const after = await cursoFrame.evaluate(() => {
        const body = document.body.textContent || '';
        return {
          body: body.substring(0, 600),
          inputs: Array.from(document.querySelectorAll('input, select, textarea')).map(i => ({
            tag: i.tagName,
            name: (i as HTMLInputElement).name,
            type: (i as HTMLInputElement).type || 'select',
            value: ((i as HTMLInputElement).value || '').substring(0, 40),
          })),
        };
      });
      console.log('\n📋 Após clicar cadastrar:');
      console.log(`   ${after.body.substring(0, 300)}`);
      console.log('\n   Inputs:', JSON.stringify(after.inputs, null, 2));
    }
  } else {
    console.log('\n⚠️ Modal de curso NÃO encontrado');
    // Verificar se há alert/erro
    const bodyText = await formFrame.textContent('body').catch(() => '') || '';
    console.log('   Form body (trecho):', bodyText.substring(0, 300));
  }
  
  await nav.takeSnapshot('diag_curso');
  await session.close();
  console.log('\n✅ Concluído');
}

main().catch(console.error);
