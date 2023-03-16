import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import {
  isValidHostname,
  isValidIPv4,
  isValidIPv6,
} from '../../utils/regex-utils';
import { AppSettingsService } from '../../services/app-settings.service';
import { HttpControlService } from '../../services/http-control.service';
import { hshrink, vshrink } from '../../utils/animations';

@Component({
  selector: 'app-http-settings-view',
  templateUrl: './http-settings-view.component.html',
  styleUrls: ['./http-settings-view.component.scss'],
  animations: [hshrink(), vshrink()],
})
export class HttpSettingsViewComponent implements OnInit, OnDestroy {
  private destroy$: Subject<void> = new Subject<void>();
  // Receiving Host
  protected httpControlHost = '';
  protected httpControlHostChange: Subject<string> = new Subject<string>();
  protected httpControlHostStatus: 'INIT' | 'OK' | 'CHECKING' | 'ERROR' =
    'INIT';
  protected httpControlHostError?: string;
  // Receiving Port
  protected httpControlPort = 0;
  protected httpControlPortChange: Subject<string> = new Subject<string>();
  protected httpControlPortStatus: 'INIT' | 'OK' | 'CHECKING' | 'ERROR' =
    'INIT';
  protected httpControlPortError?: string;
  protected errorMessages: { [s: string]: string } = {
    bindFailed:
      'This address could not be bound. It could be that another application is already using it. You can try to close that application and try again, or choose a different port or host.',
    invalidPort: 'A port has to be a valid number between 1 and 65535.',
    invalidHost:
      'The host has to be a valid hostname, IPv4 address, or IPv6 address.',
  };

  constructor(
    private settingsService: AppSettingsService,
    private httpControl: HttpControlService
  ) {}

  resetDefaults() {}

  ngOnInit() {
    this.listenForHttpControlHostChanges();
    this.listenForHttpControlPortChanges();
    this.listenForSettingsChanges();
  }

  ngOnDestroy() {
    this.destroy$.next();
  }

  listenForSettingsChanges() {
    this.settingsService.settings
      .pipe(takeUntil(this.destroy$))
      .subscribe((settings) => {
        if (settings.httpControlHost !== this.httpControlHost) {
          this.httpControlHost = settings.httpControlHost;
          this.httpControlHostChange.next(this.httpControlHost);
        }
        if (settings.httpControlPort !== this.httpControlPort) {
          this.httpControlPort = settings.httpControlPort;
          this.httpControlPortChange.next(this.httpControlPort + '');
        }
      });
  }

  listenForHttpControlHostChanges() {
    this.httpControlHostChange
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        tap(() => {
          this.httpControlHostStatus = 'CHECKING';
          this.httpControlHostError = undefined;
        }),
        debounceTime(300)
      )
      .subscribe(async (host) => {
        // Validate host
        if (
          host === '' ||
          !(isValidIPv6(host) || isValidIPv4(host) || isValidHostname(host))
        ) {
          this.httpControlHostStatus = 'ERROR';
          this.httpControlHostError = 'invalidHost';
          return;
        }
        // Try to bind
        if (!(await this.httpControl.setAddress(host, this.httpControlPort))) {
          this.httpControlPortStatus = 'ERROR';
          this.httpControlPortError = 'bindFailed';
          return;
        }
        // Save new host
        this.httpControlHost = host;
        this.httpControlHostStatus = 'OK';
      });
  }

  listenForHttpControlPortChanges() {
    this.httpControlPortChange
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        switchMap((value) =>
          combineLatest([
            this.settingsService.settings.pipe(
              map((settings) => settings.httpControlHost),
              startWith(this.httpControlHost),
              distinctUntilChanged()
            ),
            of(value),
          ]).pipe(map(([_, value]) => value))
        ),
        tap(() => {
          this.httpControlPortStatus = 'CHECKING';
          this.httpControlPortError = undefined;
        }),
        debounceTime(300)
      )
      .subscribe(async (value) => {
        // Parse port
        let port = parseInt(value);
        if (isNaN(port) || port > 65535 || port <= 0) {
          this.httpControlPortStatus = 'ERROR';
          this.httpControlPortError = 'invalidPort';
          return;
        }
        // Try to bind
        if (!(await this.httpControl.setAddress(this.httpControlHost, port))) {
          this.httpControlPortStatus = 'ERROR';
          this.httpControlPortError = 'bindFailed';
          return;
        }
        // Save new port
        this.httpControlPort = port;
        this.httpControlPortStatus = 'OK';
      });
  }
}
