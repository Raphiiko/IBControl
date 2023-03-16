import { Injectable } from '@angular/core';
import { AppSettingsService } from './app-settings.service';
import {
  BehaviorSubject,
  filter,
  firstValueFrom,
  map,
  Observable,
  pairwise,
  startWith,
} from 'rxjs';
import { invoke } from '@tauri-apps/api';
import { listen } from '@tauri-apps/api/event';
import { OpenVRService } from './openvr.service';
import { BrightnessControlService } from './brightness-control/brightness-control.service';

export type HttpControlStatus =
  | HttpControlRunning
  | HttpControlStopped
  | HttpControlError;

interface HttpControlRunning {
  status: 'RUNNING';
}

interface HttpControlStopped {
  status: 'STOPPED';
}

interface HttpControlError {
  status: 'ERROR';
  error: 'PORT_BOUND' | 'UNKNOWN';
}

interface HttpRequest {
  request_id: string;
  path: string;
  method: string;
  headers: Array<[string, string]>;
  query: string;
  body?: string;
  respond: (status: number, body: string) => Promise<void>;
}

@Injectable({
  providedIn: 'root',
})
export class HttpControlService {
  private _status: BehaviorSubject<HttpControlStatus> =
    new BehaviorSubject<HttpControlStatus>({ status: 'STOPPED' });
  public status = this._status.asObservable();

  public readonly showError: Observable<boolean> = this.status.pipe(
    map((s) => s.status === 'ERROR')
  );

  constructor(
    private appSettings: AppSettingsService,
    private openvr: OpenVRService,
    private brightnessControl: BrightnessControlService
  ) {}

  async init() {
    // Start and stop http server based on app settings
    this.appSettings.settings
      .pipe(
        startWith(null),
        pairwise(),
        filter(
          ([prev, curr]) =>
            prev == null ||
            prev!.httpControlEnabled !== curr!.httpControlEnabled
        ),
        map(([_, curr]) => curr!)
      )
      .subscribe((settings) => {
        if (settings.httpControlEnabled) {
          this.start(settings.httpControlHost, settings.httpControlPort)
            // Errors are handled elsewhere, ignore them.
            .catch(() => {});
        } else {
          this.stop()
            // Errors are handled elsewhere, ignore them.
            .catch(() => {});
        }
      });
    // Listen for incoming HTTP requests
    listen<HttpRequest>('http_call', (event) => {
      const request = event.payload;
      request.respond = async (status: number, body: string) => {
        await invoke('respond_to_request', {
          requestId: event.payload.request_id,
          status,
          body,
        });
      };
      this.handleRequest(request);
    });
  }

  async setAddress(host: string, port: number) {
    try {
      await this.start(host, port);
      let settings = await firstValueFrom(this.appSettings.settings);
      if (
        settings.httpControlHost !== host ||
        settings.httpControlPort !== port
      ) {
        settings = this.appSettings.updateSettings({
          httpControlHost: host,
          httpControlPort: port,
        });
      }
      if (!settings.httpControlEnabled) this.stop().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  private async start(host: string, port: number) {
    try {
      await invoke('start_http_server', {
        host,
        port,
      });
      this._status.next({ status: 'RUNNING' });
    } catch (e) {
      switch (e) {
        case 'BIND_FAILED':
          this._status.next({ status: 'ERROR', error: 'PORT_BOUND' });
          break;
        default:
          this._status.next({ status: 'ERROR', error: 'UNKNOWN' });
          break;
      }
      throw e;
    }
  }

  private async stop() {
    this._status.next({ status: 'STOPPED' });
    await invoke('stop_http_server');
  }

  private handleRequest(req: HttpRequest) {
    const endpoint = `${req.method.toUpperCase()} ${req.path}`;
    switch (endpoint) {
      case 'GET /brightness':
        this.handleGetBrightness(req);
        break;
      case 'PUT /brightness':
        this.handlePutBrightness(req);
        break;
    }
  }

  private async handleGetBrightness(req: HttpRequest) {
    // Check if SteamVR is active
    const status = await firstValueFrom(this.openvr.status);
    if (status !== 'INITIALIZED') {
      await req.respond(
        404,
        JSON.stringify({
          reason: 'STEAMVR_INACTIVE',
        })
      );
      return;
    }
    // Check if a controllable HMD is connected
    const available = await firstValueFrom(
      this.brightnessControl.driverIsAvailable()
    );
    if (!available) {
      await req.respond(
        404,
        JSON.stringify({
          reason: 'HMD_UNAVAILABLE',
        })
      );
      return;
    }
    try {
      // Obtain the brightness bounds
      const bounds = await this.brightnessControl.getBrightnessBounds();
      // Get the current brightness
      const brightness = await this.brightnessControl.fetchBrightness();
      // Return the current brightness
      await req.respond(
        200,
        JSON.stringify({
          brightness: brightness ?? this.brightnessControl.brightness,
          minimum: bounds![0],
          maximum: bounds![1],
        })
      );
    } catch (e) {
      if (e === 'DRIVER_UNAVAILABLE') {
        await req.respond(
          404,
          JSON.stringify({
            reason: 'HMD_UNAVAILABLE',
          })
        );
      } else {
        await req.respond(
          500,
          JSON.stringify({
            reason: 'UNKNOWN',
          })
        );
      }
    }
  }

  private async handlePutBrightness(req: HttpRequest) {
    // Parse the body
    let body: { brightness: number };
    try {
      body = JSON.parse(req.body ?? '');
      if (typeof body !== 'object') throw new Error('Invalid JSON Object');
    } catch (e) {
      await req.respond(
        400,
        JSON.stringify({ error: 'The request body provided is invalid JSON.' })
      );
      return;
    }
    // Validate contents
    if (typeof body.brightness !== 'number') {
      await req.respond(
        400,
        JSON.stringify({
          error: 'The request body does not contain a valid brightness field.',
        })
      );
      return;
    }
    // Check if SteamVR is active
    const status = await firstValueFrom(this.openvr.status);
    if (status !== 'INITIALIZED') {
      await req.respond(
        404,
        JSON.stringify({
          reason: 'STEAMVR_INACTIVE',
        })
      );
      return;
    }
    // Check if a controllable HMD is connected
    const available = await firstValueFrom(
      this.brightnessControl.driverIsAvailable()
    );
    if (!available) {
      await req.respond(
        404,
        JSON.stringify({
          reason: 'HMD_UNAVAILABLE',
        })
      );
      return;
    }
    try {
      // Validate the brightness bounds
      const bounds = await this.brightnessControl.getBrightnessBounds();
      if (body.brightness < bounds[0] || body.brightness > bounds[1]) {
        await req.respond(
          400,
          JSON.stringify({
            error:
              'The requested brightness is outside of the supported bounds. (${bounds[0]} - ${bounds[1]})',
          })
        );
        return;
      }
      // Set the brightness
      await this.brightnessControl.setBrightness(
        Math.round(body.brightness),
        'HTTP_CONTROL'
      );
      // Get the newly set brightness
      const brightness = await this.brightnessControl.fetchBrightness();
      // Return the newly set brightness
      await req.respond(
        200,
        JSON.stringify({
          brightness: brightness ?? this.brightnessControl.brightness,
          minimum: bounds![0],
          maximum: bounds![1],
        })
      );
    } catch (e) {
      if (e === 'DRIVER_UNAVAILABLE') {
        await req.respond(
          404,
          JSON.stringify({
            reason: 'HMD_UNAVAILABLE',
          })
        );
      } else {
        await req.respond(
          500,
          JSON.stringify({
            reason: 'UNKNOWN',
          })
        );
      }
    }
  }
}
