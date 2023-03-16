import { Component, OnDestroy, OnInit } from '@angular/core';
import { APP_SETTINGS_DEFAULT, AppSettings } from '../../models/settings';
import { AppSettingsService } from '../../services/app-settings.service';
import { Subject, takeUntil } from 'rxjs';
import { cloneDeep } from 'lodash';
import { hshrink } from '../../utils/animations';
import { OscService } from '../../services/osc.service';
import { HttpControlService } from '../../services/http-control.service';

@Component({
  selector: 'app-dashboard-view',
  templateUrl: './dashboard-view.component.html',
  styleUrls: ['./dashboard-view.component.scss'],
  animations: [hshrink()],
})
export class DashboardViewComponent implements OnInit, OnDestroy {
  private destroy$: Subject<void> = new Subject<void>();
  protected settings: AppSettings = cloneDeep(APP_SETTINGS_DEFAULT);

  constructor(
    private appSettings: AppSettingsService,
    protected osc: OscService,
    protected http: HttpControlService
  ) {}

  ngOnInit() {
    this.appSettings.settings
      .pipe(takeUntil(this.destroy$))
      .subscribe((settings) => (this.settings = settings));
  }

  ngOnDestroy() {
    this.destroy$.next();
  }

  toggleOSCControl() {
    this.appSettings.updateSettings({
      oscControlEnabled: !this.settings.oscControlEnabled,
    });
  }

  toggleHTTPControl() {
    this.appSettings.updateSettings({
      httpControlEnabled: !this.settings.httpControlEnabled,
    });
  }
}
