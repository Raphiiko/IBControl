import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardViewComponent } from './views/dashboard-view/dashboard-view.component';
import { OscSettingsViewComponent } from './views/osc-settings-view/osc-settings-view.component';
import { HttpSettingsViewComponent } from './views/http-settings-view/http-settings-view.component';

const routes: Routes = [
  {
    path: 'dashboard',
    component: DashboardViewComponent,
  },
  {
    path: 'oscsettings',
    component: OscSettingsViewComponent,
  },
  {
    path: 'httpsettings',
    component: HttpSettingsViewComponent,
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
