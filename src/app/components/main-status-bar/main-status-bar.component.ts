import { Component, OnDestroy, OnInit } from '@angular/core';
import { hshrink, noop } from '../../utils/animations';
import { OpenVRService } from '../../services/openvr.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-main-status-bar',
  templateUrl: './main-status-bar.component.html',
  styleUrls: ['./main-status-bar.component.scss'],
  animations: [hshrink(), noop()],
})
export class MainStatusBarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  steamVRStatusLabels: { [s: string]: string } = {
    INACTIVE: 'Inactive',
    INITIALIZING: 'Waiting',
    INITIALIZED: 'Active',
  };

  indexStatusLabels: { [s: string]: string } = {
    NOT_DETECTED: 'Inactive',
    DETECTED: 'Ready',
  };
  indexStatus: 'NOT_DETECTED' | 'DETECTED' = 'NOT_DETECTED';

  constructor(protected openvr: OpenVRService) {}

  ngOnInit(): void {
    this.openvr.devices.pipe(takeUntil(this.destroy$)).subscribe((devices) => {
      const hmd = devices.find(
        (d) =>
          d.class === 'HMD' &&
          d.manufacturerName === 'Valve' &&
          d.modelNumber === 'Index'
      );
      this.indexStatus = hmd ? 'DETECTED' : 'NOT_DETECTED';
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
  }
}
