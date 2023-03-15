export abstract class BrightnessControlDriver {
  abstract getBrightnessPercentage(): Promise<number>;
  abstract setBrightnessPercentage(percentage: number): Promise<void>;
  abstract getBrightnessBounds(): Promise<[number, number]>;
  abstract isAvailable(): Promise<boolean>;
}
