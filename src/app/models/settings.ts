export interface AppSettings {
  version: 1;
  oscSendingHost: string;
  oscSendingPort: number;
  oscReceivingHost: string;
  oscReceivingPort: number;
  oscControlEnabled: boolean;
  httpControlEnabled: boolean;
  oscVRCControlRange: [number, number];
  httpControlPort: number;
  httpControlHost: string;
}

export const APP_SETTINGS_DEFAULT: AppSettings = {
  version: 1,
  oscSendingHost: '127.0.0.1',
  oscSendingPort: 9000,
  oscReceivingHost: '127.0.0.1',
  oscReceivingPort: 9001,
  oscControlEnabled: true,
  oscVRCControlRange: [20, 160],
  httpControlEnabled: false,
  httpControlPort: 42070,
  httpControlHost: '127.0.0.1',
};
