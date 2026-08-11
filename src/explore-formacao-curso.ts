import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import type { Frame } from 'playwright';

async function main() {
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
  if (!listFrame) {
    for (const f of page.frames()) {
      if (f !== page.mainFrame() && f.url() !== 'about:blank') { listFrame = f; break; }
    }
  }
  if (!listFrame) { console.log('NO FRAME'); await session.close(); return; }

  // Extract level URLs
  const levelData = await listFrame.evaluate(() => {
    const fn = (window as any).selecionarNivel;
    if (!fn) return null;
    const source = fn.toString();
    const urlMatch = source.match(/var\s+url\s*=\s*"([^"]+)"/);
    const baseUrl = urlMatch ? urlMatch[1] : '';
    const result: Array<{ name: string; url: string }> = [];
    let match: RegExpExecArray | null;
    const regex = /\["([^"]+)",\s*url\s*\+\s*"([^"]+)"\]/g;
    while ((match = regex.exec(source)) !== null) {
      result.push({ name: match[1], url: baseUrl + match[2] });
    }
    return result;
  });

  // Find Especialização
  const espec = levelData?.find(l => l.name === 'Especialização');
  if (!espec) { console.log('NO ESPEC'); await session.close(); return; }
  console.log('Especialização URL:', espec.url);

  // Open form
  await listFrame.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, espec.url);
  await page.waitForTimeout(5000);

  // Find form frame
  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url !== listFrame.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
      formFrame = f; break;
    }
  }
  if (!formFrame) { console.log('NO FORM FRAME'); await session.close(); return; }
  console.log('Form Frame:', formFrame.url());

  // Get ALL inputs and their attributes, especially lupa-related
  const formInfo = await formFrame.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    const result: any[] = [];
    inputs.forEach(inp => {
      const lupaLink = inp.nextElementSibling;
      result.push({
        name: inp.name,
        type: inp.type,
        value: inp.value,
        disabled: inp.disabled,
        className: inp.className,
        nextTag: lupaLink?.tagName,
        nextClass: lupaLink?.className,
        nextOnclick: lupaLink?.getAttribute('onclick')?.substring(0, 200),
        nextHref: (lupaLink as HTMLAnchorElement)?.href?.substring(0, 200),
      });
    });

    // Also get links with "lupa" class
    const lupaLinks = document.querySelectorAll('a.lupa, a[href*="lupa"]');
    const lupaInfo: any[] = [];
    lupaLinks.forEach(a => {
      lupaInfo.push({
        text: a.textContent?.trim(),
        href: a.href,
        onclick: a.getAttribute('onclick')?.substring(0, 200),
        prevSibling: (a.previousElementSibling as HTMLInputElement)?.name,
      });
    });

    // Get global functions
    const fns = Object.keys(window).filter(k =>
      typeof (window as any)[k] === 'function' &&
      (k.includes('inst') || k.includes('curso') || k.includes('sele') || k.includes('lupa') || k.includes('dominio'))
    );

    return { inputs: result, lupaLinks: lupaInfo, globalFns: fns };
  });

  console.log('\nINPUTS:');
  for (const inp of formInfo.inputs) {
    console.log(`  ${inp.name} (${inp.type}) disabled=${inp.disabled} value="${inp.value}" next=${inp.nextTag}.${inp.nextClass} onclick=${inp.nextOnclick}`);
  }

  console.log('\nLUPA LINKS:');
  for (const l of formInfo.lupaLinks) {
    console.log(`  prev=${l.prevSibling} text="${l.text}" onclick=${l.onclick}`);
  }

  console.log('\nGLOBAL FUNCTIONS:', formInfo.globalFns);

  // Now try to fill institution
  console.log('\n--- Filling institution ---');
  const instResult = await nav.fillLupa('f_inst', 'FIAP', formFrame);
  console.log('fillLupa inst:', instResult);
  await page.waitForTimeout(2000);

  // Check what happened to f_curso after filling inst
  const afterInst = await formFrame.evaluate(() => {
    const cursoInput = document.querySelector('input[name="f_curso"]') as HTMLInputElement;
    const cursoLink = cursoInput?.nextElementSibling as HTMLAnchorElement;
    return {
      cursoValue: cursoInput?.value,
      cursoDisabled: cursoInput?.disabled,
      cursoLinkOnclick: cursoLink?.getAttribute('onclick')?.substring(0, 200),
    };
  });
  console.log('\nAfter inst fill, f_curso:', JSON.stringify(afterInst));

  // Now try to fill curso
  console.log('\n--- Filling curso ---');
  const cursoResult = await nav.fillLupa('f_curso', 'Gestão de Produtos Digitais', formFrame);
  console.log('fillLupa curso:', cursoResult);

  // Check final state
  const finalState = await formFrame.evaluate(() => {
    const inst = document.querySelector('input[name="f_inst"]') as HTMLInputElement;
    const curso = document.querySelector('input[name="f_curso"]') as HTMLInputElement;
    return {
      instValue: inst?.value,
      cursoValue: curso?.value,
    };
  });
  console.log('\nFinal state:', JSON.stringify(finalState));

  await nav.takeSnapshot('explore_formacao_curso');
  await session.close();
}

main().catch(console.error);
