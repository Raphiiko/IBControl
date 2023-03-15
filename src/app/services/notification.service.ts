import { Injectable } from '@angular/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/api/notification';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor() {}

  async notify(title: string, body: string) {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    if (!permissionGranted) return;
    await sendNotification({ title, body });
  }
}
