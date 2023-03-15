import { Injectable } from '@angular/core';
import { invoke } from '@tauri-apps/api';
import { TaskQueue } from '../utils/task-queue';
import { debug, warn } from 'tauri-plugin-log-api';
import { listen } from '@tauri-apps/api/event';
import {
  OSCMessage,
  OSCMessageRaw,
  parseOSCMessage,
} from '../models/osc-message';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  firstValueFrom,
  map,
  Observable,
  Subject,
  take,
  tap,
} from 'rxjs';
import { AppSettingsService } from './app-settings.service';
import { NotificationService } from './notification.service';

interface LastBindNotification {
  time: number;
  receiveAddr: string;
}

@Injectable({
  providedIn: 'root',
})
export class OscService {
  private scriptQueue: TaskQueue = new TaskQueue({
    runUniqueTasksConcurrently: true,
  });
  private _messages: Subject<OSCMessage> = new Subject<OSCMessage>();
  public messages: Observable<OSCMessage> = this._messages.asObservable();

  private _initializedOnAddress: BehaviorSubject<string | null> =
    new BehaviorSubject<string | null>(null);

  private lastBindNotification: BehaviorSubject<LastBindNotification | null> =
    new BehaviorSubject<LastBindNotification | null>(null);

  public readonly showError: Observable<boolean> = combineLatest([
    this._initializedOnAddress,
    this.lastBindNotification,
  ]).pipe(
    map(([initialized, lastBind]) => initialized == null && lastBind != null)
  );

  constructor(
    private appSettings: AppSettingsService,
    private notificationService: NotificationService
  ) {}

  async init() {
    listen<OSCMessageRaw>('OSC_MESSAGE', (data) => {
      this._messages.next(parseOSCMessage(data.payload));
    });
    this.appSettings.settings
      .pipe(
        map(
          (settings) =>
            [settings.oscReceivingHost, settings.oscReceivingPort] as [
              string,
              number
            ]
        ),
        take(1),
        filter(([host, port]) => port > 0 && port <= 65535),
        tap(([host, port]) => this.init_receiver(host, port))
      )
      .subscribe();
  }

  async init_receiver(host: string, port: number): Promise<boolean> {
    const receiveAddr = `${host}:${port}`;
    // Receive notification if this is a new address
    if (
      this.lastBindNotification.value &&
      this.lastBindNotification.value?.receiveAddr !== receiveAddr
    )
      this.lastBindNotification.next(null);
    // If we are already initialized on this address, return true
    if (this._initializedOnAddress.value === receiveAddr) return true;
    // Attempt initializing on this address
    const result = await invoke<boolean>('osc_init', { receiveAddr });
    if (!result) {
      warn(`[OSC] Could not bind a UDP socket on ${receiveAddr}.`);
      this._initializedOnAddress.next(null);
      // Send notification if the last notification for this exact binding was more than 30 seconds ago
      if (
        !this.lastBindNotification.value ||
        Date.now() - this.lastBindNotification.value.time > 30000
      ) {
        this.lastBindNotification.next({
          time: Date.now(),
          receiveAddr,
        });
        await this.notificationService.notify(
          'OSC Control Problem',
          'Could not start OSC Control with the current settings. Please check your OSC Control settings.'
        );
      }
      return false;
    } else {
      this.lastBindNotification.next(null);
      this._initializedOnAddress.next(receiveAddr);
    }
    return result;
  }

  async send_float(address: string, value: number) {
    debug(`[OSC] Sending float ${value} to ${address}`);
    const addr = await firstValueFrom(this.appSettings.settings).then(
      (settings) => settings.oscSendingHost + ':' + settings.oscSendingPort
    );
    await invoke('osc_send_float', { addr, oscAddr: address, data: value });
  }

  async send_int(address: string, value: number) {
    debug(`[OSC] Sending int ${value} to ${address}`);
    const addr = await firstValueFrom(this.appSettings.settings).then(
      (settings) => settings.oscSendingHost + ':' + settings.oscSendingPort
    );
    await invoke('osc_send_int', { addr, oscAddr: address, data: value });
  }

  async send_bool(address: string, value: boolean) {
    debug(`[OSC] Sending bool ${value} to ${address}`);
    const addr = await firstValueFrom(this.appSettings.settings).then(
      (settings) => settings.oscSendingHost + ':' + settings.oscSendingPort
    );
    await invoke('osc_send_bool', { addr, oscAddr: address, data: value });
  }
}
