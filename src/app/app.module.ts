import { OpenVRService } from './services/openvr.service';
import { CommonModule } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { NgModule } from '@angular/core';
import { AppSettingsService } from './services/app-settings.service';
import { OscService } from './services/osc.service';
import { DashboardViewComponent } from './views/dashboard-view/dashboard-view.component';
import { AppRoutingModule } from './app-routing.module';
import { BrightnessSliderComponent } from './components/brightness-slider/brightness-slider.component';
import { OscSettingsViewComponent } from './views/osc-settings-view/osc-settings-view.component';
import { OscControlService } from './services/osc-control.service';
import { BrightnessControlService } from './services/brightness-control/brightness-control.service';
import { MainStatusBarComponent } from './components/main-status-bar/main-status-bar.component';
import { VarDirective } from './directives/var.directive';
import { ImageFallbackDirective } from './directives/image-fallback.directive';

@NgModule({
  bootstrap: [AppComponent],
  declarations: [
    AppComponent,
    DashboardViewComponent,
    BrightnessSliderComponent,
    OscSettingsViewComponent,
    MainStatusBarComponent,
    VarDirective,
    ImageFallbackDirective,
  ],
  imports: [
    CommonModule,
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
  ],
  providers: [],
})
export class AppModule {
  constructor(
    private openvr: OpenVRService,
    private appSettingsService: AppSettingsService,
    private oscService: OscService,
    private oscControl: OscControlService,
    private brightnessControl: BrightnessControlService
  ) {
    this.init();
  }

  async init() {
    await this.appSettingsService.init();
    await this.openvr.init();
    await this.brightnessControl.init();
    await this.oscService.init();
    await this.oscControl.init();
  }
}
