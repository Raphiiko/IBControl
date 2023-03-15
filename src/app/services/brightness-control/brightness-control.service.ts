import { Injectable } from '@angular/core';
import { BrightnessControlDriver } from './drivers/brightness-control-driver';
import { ValveIndexBrightnessControlDriver } from './drivers/valve-index-brightness-control-driver';
import { OpenVRService } from '../openvr.service';
import { BehaviorSubject, filter, Observable, pairwise, startWith } from 'rxjs';
import { isEqual } from 'lodash';

@Injectable({
  providedIn: 'root',
})
export class BrightnessControlService {
  driver?: BrightnessControlDriver;
  private _brightness: BehaviorSubject<number> = new BehaviorSubject<number>(
    100
  );
  get brightness(): number {
    return this._brightness.value;
  }

  public readonly brightnessStream: Observable<number> =
    this._brightness.asObservable();

  constructor(private openvr: OpenVRService) {
    this.driver = new ValveIndexBrightnessControlDriver(openvr);
  }

  async init() {
    this.openvr.devices
      .pipe(
        startWith([]),
        pairwise(),
        filter(([oldDevices, newDevices]) => {
          const oldHMD = oldDevices.find((d) => d.class === 'HMD');
          const newHMD = newDevices.find((d) => d.class === 'HMD');
          return !isEqual(oldHMD, newHMD);
        })
      )
      .subscribe(async () => {
        await this.fetchBrightness();
      });
  }

  setBrightness(
    percentage: number,
    reason: 'DIRECT' | 'OSC_CONTROL' | 'HTTP_CONTROL'
  ) {
    if (percentage == this.brightness) return;
    this._brightness.next(percentage);
    this.driver?.setBrightnessPercentage(percentage);
  }

  async driverIsAvailable(): Promise<boolean> {
    if (!this.driver) return false;
    return this.driver!.isAvailable();
  }

  async fetchBrightness(): Promise<number | undefined> {
    const brightness =
      (await this.driver?.getBrightnessPercentage()) ?? undefined;
    if (brightness !== undefined) this._brightness.next(brightness);
    return brightness;
  }
}
