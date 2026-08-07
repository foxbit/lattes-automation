import { SessionManager } from './auth/session-manager.js';
import { LattesNavigator } from './navigator/playwright-engine.js';
import { existsSync, writeFileSync } from 'fs';

async function main() {
  const sm = new SessionManager();
  console.log('Restoring session...');
  const page = await sm.restoreSession();
  if (!page) {
    console.error('Failed to restore session. Exiting.');
    process.exit(1);
  }

  const nav = new LattesNavigator(page);
  console.log('Opening menu...');
  await nav.openMenu('Dados gerais');
  await nav.takeSnapshot('test_menu_open');

  console.log('Clicking Identificação...');
  await nav.clickSubmenuItem('Identificação');
  await nav.takeSnapshot('test_submenu_clicked');

  console.log('Looking for modal frame...');
  try {
    const frame = await nav.getModalFrame();
    if (frame) {
      console.log('Found frame!');
      const title = await nav.getModalTitle();
      console.log('Modal title:', title);
      const fields = await nav.readFormFields(frame);
      console.log('Found', fields.length, 'fields.');
    } else {
      console.log('Frame not found.');
    }
  } catch (err) {
    console.error('Error getting frame:', err);
  }

  const dom = await page.content();
  writeFileSync('data/logs/dom_dump.html', dom);
  console.log('DOM dumped to data/logs/dom_dump.html');

  await nav.takeSnapshot('test_final');
  await sm.close();
}

main().catch(console.error);
