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

  // Open Especialização form
  const levelData = await listFrame!.evaluate(() => {
    const fn = (window as any).selecionarNivel;
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

  const espec = levelData.find(l => l.name === 'Especialização')!;
  await listFrame!.evaluate((url: string) => {
    (self.parent as any).modalCV2.setarUrl(url, true);
  }, espec.url);
  await page.waitForTimeout(5000);

  let formFrame: Frame | null = null;
  for (const f of page.frames()) {
    const url = f.url();
    if (url !== listFrame!.url() && url !== page.mainFrame().url() && url !== 'about:blank') {
      formFrame = f; break;
    }
  }
  if (!formFrame) { console.log('NO FORM FRAME'); await session.close(); return; }

  // Get the curso() function source
  const cursoFnSrc = await formFrame.evaluate(() => {
    const fn = (window as any).curso;
    return fn ? fn.toString().substring(0, 1000) : 'NOT FOUND';
  });
  console.log('curso() function:\n', cursoFnSrc);

  // Get sele_inst function source
  const seleInstSrc = await formFrame.evaluate(() => {
    const fn = (window as any).sele_inst;
    return fn ? fn.toString().substring(0, 500) : 'NOT FOUND';
  });
  console.log('\nsele_inst() function:\n', seleInstSrc);

  // Now let's try to properly fill institution by calling sele_inst directly
  // and handling the modalCV3 interaction
  console.log('\n--- Attempting direct sele_inst + modalCV3 handling ---');

  // Open the institution search
  await formFrame.evaluate(() => {
    (window as any).sele_inst(1);
  });
  await page.waitForTimeout(3000);

  // Find the modalCV3 frame
  let cv3Frame: Frame | null = null;
  for (const f of page.frames()) {
    if (f.url().includes('prc_inst')) { cv3Frame = f; break; }
  }

  if (cv3Frame) {
    console.log('CV3 Frame:', cv3Frame.url());

    // Get the search input
    const searchInputs = await cv3Frame.$$('input[type="text"]');
    console.log('Search inputs in CV3:', searchInputs.length);

    for (const inp of searchInputs) {
      const name = await inp.getAttribute('name');
      const placeholder = await inp.getAttribute('placeholder');
      console.log(`  Input: name=${name} placeholder=${placeholder}`);
    }

    // Type FIAP and search
    if (searchInputs.length > 0) {
      const searchInput = searchInputs[0];
      const name = await searchInput.getAttribute('name') || '';

      await cv3Frame.evaluate(({ name, term }: { name: string; term: string }) => {
        const inp = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
        if (inp) {
          inp.value = term;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, { name, term: 'FIAP' });

      await page.waitForTimeout(500);

      // Click search button
      await cv3Frame.evaluate(() => {
        const all = document.querySelectorAll('a, input[type="submit"], input[type="button"], button');
        for (const el of all) {
          if (el.textContent?.includes('Pesquisar') || (el as HTMLInputElement).value?.includes('Pesquisar')) {
            (el as HTMLElement).click();
            break;
          }
        }
      });

      await page.waitForTimeout(3000);

      // Check results
      const results = await cv3Frame.evaluate(() => {
        const rows = document.querySelectorAll('tr[onclick]');
        return Array.from(rows).map(r => ({
          text: r.textContent?.trim().substring(0, 100),
          onclick: r.getAttribute('onclick')?.substring(0, 200),
        }));
      });
      console.log('\nSearch results:');
      for (const r of results) {
        console.log(`  ${r.text} → ${r.onclick}`);
      }

      // Click first result
      if (results.length > 0) {
        const firstRow = await cv3Frame.$('tr[onclick]');
        if (firstRow) {
          const onclick = await firstRow.getAttribute('onclick');
          console.log('\nClicking first result, onclick:', onclick?.substring(0, 200));
          if (onclick) {
            await cv3Frame.evaluate(onclick);
          } else {
            await firstRow.click();
          }
          await page.waitForTimeout(2000);
        }
      }

      // Remove overlay
      await page.evaluate(() => {
        document.querySelectorAll('.overlayDiv, .blockUI, .blockOverlay').forEach(el => el.remove());
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }
  } else {
    console.log('CV3 Frame NOT found');
  }

  // Check institution value now
  const instState = await formFrame.evaluate(() => {
    const inst = document.querySelector('input[name="f_inst"]') as HTMLInputElement;
    const codInst = document.querySelector('input[name="f_cod_inst"]') as HTMLInputElement;
    return {
      instValue: inst?.value,
      codInstValue: codInst?.value,
    };
  });
  console.log('\nAfter sele_inst, institution state:', JSON.stringify(instState));

  // Now try to fill curso
  if (instState.instValue) {
    console.log('\n--- Institution set, now trying curso() ---');
    // Check if curso() function now works
    const cursoAvailable = await formFrame.evaluate(() => {
      const fn = (window as any).curso;
      if (!fn) return 'NOT FOUND';
      // Try calling it
      try {
        fn();
        return 'CALLED';
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    });
    console.log('curso() call result:', cursoAvailable);
    await page.waitForTimeout(2000);
  }

  await nav.takeSnapshot('explore_formacao_direct');
  await session.close();
}

main().catch(console.error);
