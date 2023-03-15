import { enableProdMode, isDevMode } from '@angular/core';

import { environment } from './environments/environment';
import { AppModule } from './app/app.module';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { attachConsole, info } from 'tauri-plugin-log-api';
import { getVersion } from './app/utils/app-utils';

if (environment.production) {
  enableProdMode();
}

if (isDevMode()) {
  attachConsole();
}

getVersion().then((version) => {
  info('[IBControl] Starting IBControl v' + version);
});

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
