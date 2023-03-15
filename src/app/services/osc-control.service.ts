import { Injectable } from '@angular/core';
import { AppSettingsService } from './app-settings.service';
import { OscService } from './osc.service';
import { firstValueFrom } from 'rxjs';
import { OSCFloatValue, OSCIntValue, OSCValue } from '../models/osc-message';
import { clamp, lerp } from '../utils/number-utils';
import { AppSettings } from '../models/settings';
import { BrightnessControlService } from './brightness-control/brightness-control.service';

@Injectable({
  providedIn: 'root',
})
export class OscControlService {
  constructor(
    private appSettings: AppSettingsService,
    private osc: OscService,
    private brightnessControl: BrightnessControlService
  ) {}

  async init() {
    // Emit current brightness on OSC connect
    const settings = await firstValueFrom(this.appSettings.settings);
    await this.setVRChatBrightnessRadial(settings);
    // Handle OSC messages
    this.osc.messages.subscribe(async (message) => {
      // Skip if OSC control is disabled
      const settings = await firstValueFrom(this.appSettings.settings);
      if (!settings.oscControlEnabled) return;
      switch (message.address) {
        case '/avatar/parameters/IBControl/Brightness':
          await this.handleVRChatBrightness(message.values[0], settings);
          break;
        case '/IBControl/Brightness/':
          await this.handleBrightness(message.values[0]);
          break;
        case '/avatar/change':
          await this.setVRChatBrightnessRadial(settings);
          break;
        default:
          break;
      }
    });
  }

  private async setVRChatBrightnessRadial(settings?: AppSettings) {
    settings ??= await firstValueFrom(this.appSettings.settings);
    const min = settings.oscVRCControlRange[0];
    const max = settings.oscVRCControlRange[1];
    const brightness = this.brightnessControl.brightness;
    const radialValue = clamp((brightness - min) / (max - min), 0.0, 1.0);
    await this.osc.send_float(
      '/avatar/parameters/IBControl/Brightness',
      radialValue
    );
  }

  private async handleVRChatBrightness(
    oscValue: OSCValue,
    settings?: AppSettings
  ) {
    if (oscValue.kind !== 'float') return;
    if (!(await this.brightnessControl.driverIsAvailable())) return;
    const bounds = await this.brightnessControl.driver!.getBrightnessBounds();
    settings ??= await firstValueFrom(this.appSettings.settings);
    const radialValue = clamp(oscValue.value, 0.0, 1.0); // 0.0 - 1.0
    const brightness = clamp(
      Math.round(
        lerp(
          settings.oscVRCControlRange[0],
          settings.oscVRCControlRange[1],
          radialValue
        )
      ),
      bounds[0],
      bounds[1]
    );
    await this.handleBrightness({ kind: 'float', value: brightness });
  }

  private async handleBrightness(oscValue: OSCValue) {
    if (!['float', 'int'].includes(oscValue.kind)) return;
    if (!(await this.brightnessControl.driverIsAvailable())) return;
    const bounds = await this.brightnessControl.driver!.getBrightnessBounds();
    const brightness = clamp(
      (oscValue as OSCIntValue | OSCFloatValue).value,
      bounds[0],
      bounds[1]
    );
    await this.brightnessControl.setBrightness(brightness, 'OSC_CONTROL');
  }
}
