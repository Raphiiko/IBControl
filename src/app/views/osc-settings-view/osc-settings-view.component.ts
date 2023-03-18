import { Component, OnDestroy, OnInit } from '@angular/core';
import { hshrink, vshrink } from '../../utils/animations';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { AppSettingsService } from '../../services/app-settings.service';
import {
  isValidHostname,
  isValidIPv4,
  isValidIPv6,
} from '../../utils/regex-utils';
import { OscService } from '../../services/osc.service';
import { APP_SETTINGS_DEFAULT } from '../../models/settings';
import { isEqual } from 'lodash';
import { BrightnessControlService } from '../../services/brightness-control/brightness-control.service';
import { clamp } from '../../utils/number-utils';

@Component({
  selector: 'app-osc-settings-view',
  templateUrl: './osc-settings-view.component.html',
  styleUrls: ['./osc-settings-view.component.scss'],
  animations: [hshrink(), vshrink()],
})
export class OscSettingsViewComponent implements OnInit, OnDestroy {
  private destroy$: Subject<void> = new Subject<void>();
  // Brightness range for VRChat control
  protected vrchatBrightnessRangeMin = 0;
  protected vrchatBrightnessRangeMinChange: Subject<string> =
    new Subject<string>();
  protected vrchatBrightnessRangeMax = 0;
  protected vrchatBrightnessRangeMaxChange: Subject<string> =
    new Subject<string>();
  // Sending Host
  protected oscSendingHost = '';
  protected oscSendingHostChange: Subject<string> = new Subject<string>();
  protected oscSendingHostStatus: 'INIT' | 'OK' | 'CHECKING' | 'ERROR' = 'INIT';
  protected oscSendingHostError?: string;
  // Sending Port
  protected oscSendingPort = 0;
  protected oscSendingPortChange: Subject<string> = new Subject<string>();
  protected oscSendingPortStatus: 'INIT' | 'OK' | 'CHECKING' | 'ERROR' = 'INIT';
  protected oscSendingPortError?: string;
  // Receiving Host
  protected oscReceivingHost = '';
  protected oscReceivingHostChange: Subject<string> = new Subject<string>();
  protected oscReceivingHostStatus: 'INIT' | 'OK' | 'CHECKING' | 'ERROR' =
    'INIT';
  protected oscReceivingHostError?: string;
  // Receiving Port
  protected oscReceivingPort = 0;
  protected oscReceivingPortChange: Subject<string> = new Subject<string>();
  protected oscReceivingPortStatus: 'INIT' | 'OK' | 'CHECKING' | 'ERROR' =
    'INIT';
  protected oscReceivingPortError?: string;
  protected errorMessages: { [s: string]: string } = {
    bindFailed:
      'This address could not be bound. It could be that another application is already using it. You can try to close that application and try again, or choose a different receiving port or host.',
    invalidPort: 'A port has to be a valid number between 1 and 65535.',
    samePort:
      'You cannot use the same port for the sending and receiving port when the hosts for sending and receiving are the same.',
    invalidHost:
      'The host has to be a valid hostname, IPv4 address, or IPv6 address.',
  };
  protected driverAvailable?: Observable<boolean>;

  constructor(
    protected appSettings: AppSettingsService,
    private osc: OscService,
    protected brightnessControl: BrightnessControlService
  ) {
    this.driverAvailable = this.brightnessControl.driverIsAvailable();
  }

  ngOnInit() {
    this.listenForReceivingHostChanges();
    this.listenForVRChatBrightnessRangeChanges();
    this.listenForReceivingPortChanges();
    this.listenForSendingHostChanges();
    this.listenForSendingPortChanges();
    this.listenForSettingsChanges();
  }

  ngOnDestroy() {
    this.destroy$.next();
  }

  async toggleOSCControl() {
    const settings = await firstValueFrom(this.appSettings.settings);
    this.appSettings.updateSettings({
      httpControlEnabled: !settings.httpControlEnabled,
    });
  }

  listenForSettingsChanges() {
    this.appSettings.settings
      .pipe(takeUntil(this.destroy$))
      .subscribe((settings) => {
        if (
          !isEqual(settings.oscVRCControlRange, [
            this.vrchatBrightnessRangeMin,
            this.vrchatBrightnessRangeMax,
          ])
        ) {
          this.vrchatBrightnessRangeMin = settings.oscVRCControlRange[0];
          this.vrchatBrightnessRangeMax = settings.oscVRCControlRange[1];
          this.vrchatBrightnessRangeMinChange.next(
            this.vrchatBrightnessRangeMin + ''
          );
          this.vrchatBrightnessRangeMaxChange.next(
            this.vrchatBrightnessRangeMax + ''
          );
        }
        if (settings.oscReceivingHost !== this.oscReceivingHost) {
          this.oscReceivingHost = settings.oscReceivingHost;
          this.oscReceivingHostChange.next(this.oscReceivingHost);
        }
        if (settings.oscReceivingPort !== this.oscReceivingPort) {
          this.oscReceivingPort = settings.oscReceivingPort;
          this.oscReceivingPortChange.next(this.oscReceivingPort + '');
        }
        if (settings.oscSendingHost !== this.oscSendingHost) {
          this.oscSendingHost = settings.oscSendingHost;
          this.oscSendingHostChange.next(this.oscSendingHost);
        }
        if (settings.oscSendingPort !== this.oscSendingPort) {
          this.oscSendingPort = settings.oscSendingPort;
          this.oscSendingPortChange.next(this.oscSendingPort + '');
        }
      });
  }

  listenForVRChatBrightnessRangeChanges() {
    combineLatest([
      this.vrchatBrightnessRangeMinChange.pipe(distinctUntilChanged()),
      this.vrchatBrightnessRangeMaxChange.pipe(distinctUntilChanged()),
    ])
      .pipe(
        distinctUntilChanged(),
        debounceTime(300),
        takeUntil(this.destroy$),
        map(([min, max]) => [parseInt(min), parseInt(max)])
      )
      .subscribe(async ([min, max]) => {
        if (!(await firstValueFrom(this.brightnessControl.driverIsAvailable())))
          return;
        const bounds = await this.brightnessControl.getBrightnessBounds();
        min = clamp(min, bounds[0], bounds[1]);
        max = clamp(max, bounds[0], bounds[1]);
        if (min > max) {
          // Modifying min, so up the max
          if (min !== this.vrchatBrightnessRangeMin) max = min;
          // Modifying max, so lower the min
          else if (max !== this.vrchatBrightnessRangeMax) min = max;
          // Should never happen
          else return;
        }
        this.vrchatBrightnessRangeMin = min;
        this.vrchatBrightnessRangeMax = max;
        this.appSettings.updateSettings({
          oscVRCControlRange: [min, max],
        });
      });
  }

  listenForReceivingHostChanges() {
    this.oscReceivingHostChange
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        switchMap((value) =>
          combineLatest([of(value)]).pipe(map(([value]) => value))
        ),
        tap(() => {
          this.oscReceivingHostStatus = 'CHECKING';
          this.oscReceivingHostError = undefined;
        }),
        debounceTime(300)
      )
      .subscribe(async (host) => {
        // Validate host
        if (
          host === '' ||
          !(isValidIPv6(host) || isValidIPv4(host) || isValidHostname(host))
        ) {
          this.oscReceivingHostStatus = 'ERROR';
          this.oscReceivingHostError = 'invalidHost';
          return;
        }
        // Try to bind
        if (!(await this.osc.init_receiver(host, this.oscReceivingPort))) {
          this.oscReceivingPortStatus = 'ERROR';
          this.oscReceivingPortError = 'bindFailed';
          return;
        }
        // Save new host
        this.oscReceivingHost = host;
        this.oscReceivingHostStatus = 'OK';
        this.appSettings.updateSettings({
          oscReceivingHost: host,
        });
      });
  }

  listenForSendingHostChanges() {
    this.oscSendingHostChange
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        switchMap((value) =>
          combineLatest([of(value)]).pipe(map(([value]) => value))
        ),
        tap(() => {
          this.oscSendingHostStatus = 'CHECKING';
          this.oscSendingHostError = undefined;
        }),
        debounceTime(300)
      )
      .subscribe(async (host) => {
        // Validate host
        if (
          host === '' ||
          !(isValidIPv6(host) || isValidIPv4(host) || isValidHostname(host))
        ) {
          this.oscSendingHostStatus = 'ERROR';
          this.oscSendingHostError = 'invalidHost';
          return;
        }
        // Save new host
        this.oscSendingHost = host;
        this.oscSendingHostStatus = 'OK';
        this.appSettings.updateSettings({
          oscSendingHost: host,
        });
      });
  }

  listenForReceivingPortChanges() {
    this.oscReceivingPortChange
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        switchMap((value) =>
          combineLatest([
            this.appSettings.settings.pipe(
              map((settings) => settings.oscSendingPort),
              startWith(this.oscSendingPort),
              distinctUntilChanged()
            ),
            of(value),
          ]).pipe(map(([_, value]) => value))
        ),
        tap(() => {
          this.oscReceivingPortStatus = 'CHECKING';
          this.oscReceivingPortError = undefined;
        }),
        debounceTime(300)
      )
      .subscribe(async (value) => {
        // Parse port
        let port = parseInt(value);
        if (isNaN(port) || port > 65535 || port <= 0) {
          this.oscReceivingPortStatus = 'ERROR';
          this.oscReceivingPortError = 'invalidPort';
          return;
        }
        // Validate port
        if (
          port === this.oscSendingPort &&
          this.oscReceivingHost === this.oscSendingHost
        ) {
          this.oscReceivingPortStatus = 'ERROR';
          this.oscReceivingPortError = 'samePort';
          return;
        }
        // Try to bind
        if (!(await this.osc.init_receiver(this.oscReceivingHost, port))) {
          this.oscReceivingPortStatus = 'ERROR';
          this.oscReceivingPortError = 'bindFailed';
          return;
        }
        // Save new port
        this.oscReceivingPort = port;
        this.oscReceivingPortStatus = 'OK';
        this.appSettings.updateSettings({
          oscReceivingPort: port,
        });
      });
  }

  listenForSendingPortChanges() {
    this.oscSendingPortChange
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        switchMap((value) =>
          combineLatest([
            this.appSettings.settings.pipe(
              map((settings) => settings.oscReceivingPort),
              startWith(this.oscReceivingPort),
              distinctUntilChanged()
            ),
            of(value),
          ]).pipe(map(([_, value]) => value))
        ),
        tap(() => {
          this.oscSendingPortStatus = 'CHECKING';
          this.oscSendingPortError = undefined;
        }),
        debounceTime(300)
      )
      .subscribe((value) => {
        // Parse port
        let port = parseInt(value);
        if (isNaN(port) || port > 65535 || port <= 0) {
          this.oscSendingPortStatus = 'ERROR';
          this.oscSendingPortError = 'invalidPort';
          return;
        }
        // Validate port
        if (
          port === this.oscReceivingPort &&
          this.oscReceivingHost === this.oscSendingHost
        ) {
          this.oscSendingPortStatus = 'ERROR';
          this.oscSendingPortError = 'samePort';
          return;
        }
        // Save new port
        this.oscSendingPort = port;
        this.oscSendingPortStatus = 'OK';
        this.appSettings.updateSettings({
          oscSendingPort: port,
        });
      });
  }

  resetDefaults() {
    this.appSettings.updateSettings({
      oscControlEnabled: APP_SETTINGS_DEFAULT.oscControlEnabled,
    });
    this.vrchatBrightnessRangeMinChange.next(
      APP_SETTINGS_DEFAULT.oscVRCControlRange[0] + ''
    );
    this.vrchatBrightnessRangeMaxChange.next(
      APP_SETTINGS_DEFAULT.oscVRCControlRange[1] + ''
    );
    this.oscSendingHostChange.next(APP_SETTINGS_DEFAULT.oscSendingHost);
    this.oscSendingPortChange.next(APP_SETTINGS_DEFAULT.oscSendingPort + '');
    this.oscReceivingHostChange.next(APP_SETTINGS_DEFAULT.oscReceivingHost);
    this.oscReceivingPortChange.next(
      APP_SETTINGS_DEFAULT.oscReceivingPort + ''
    );
  }
}
