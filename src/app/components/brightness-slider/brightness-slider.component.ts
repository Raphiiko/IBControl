import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { clamp } from '../../utils/number-utils';
import {
  async,
  BehaviorSubject,
  distinctUntilChanged,
  filter,
  map,
  Observable,
  skip,
  Subject,
  switchMap,
  take,
  takeUntil,
  throttleTime,
} from 'rxjs';
import { BrightnessControlService } from '../../services/brightness-control/brightness-control.service';
import { OpenVRService } from '../../services/openvr.service';

@Component({
  selector: 'app-brightness-slider',
  templateUrl: './brightness-slider.component.html',
  styleUrls: ['./brightness-slider.component.scss'],
})
export class BrightnessSliderComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private dragging = false;
  protected thumbOffsetStyle = '0';
  protected markOffsetStyle = '0';

  protected _value: BehaviorSubject<number> = new BehaviorSubject(100);
  private minValue = 20;
  private maxValue = 160;
  private snapValue = 100;
  private destroy$: Subject<void> = new Subject<void>();
  protected disabled?: Observable<boolean>;

  @ViewChild('containerEl') containerEl?: ElementRef;
  @ViewChild('trackEl') trackEl?: ElementRef;
  @ViewChild('thumbEl') thumbEl?: ElementRef;
  @ViewChild('markEl') markEl?: ElementRef;

  constructor(
    private brightnessControl: BrightnessControlService,
    private openvr: OpenVRService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.disabled = this.brightnessControl
      .driverIsAvailable()
      .pipe(map((driverAvailable) => !driverAvailable));
  }

  async ngAfterViewInit() {
    // Determine mark offset
    setTimeout(() => {
      const min = this.trackEl?.nativeElement.offsetLeft;
      const max = this.trackEl?.nativeElement.offsetWidth + min;
      const value =
        (this.snapValue - this.minValue) / (this.maxValue - this.minValue);
      const offset = value * (max - min);
      this.markOffsetStyle = 'calc(' + offset + 'px - 0.125em)';
      this.cdr.detectChanges();
    });
    // Move thumb based on value changes
    this._value.pipe(skip(1), takeUntil(this.destroy$)).subscribe((value) => {
      value =
        (clamp(value, this.minValue, this.maxValue) - this.minValue) /
        (this.maxValue - this.minValue);
      // Calculate bounds
      const min =
        this.containerEl?.nativeElement.offsetLeft +
        this.thumbEl?.nativeElement.offsetWidth / 2;
      const max = this.containerEl?.nativeElement.offsetWidth || 0;
      // Calculate offset
      const offset = value * (max - min) + min;
      // Move thumb to offset
      this.thumbOffsetStyle = 'calc(' + offset + 'px - 3em)';
      this.cdr.detectChanges();
    });
    // Set brightness based on value changes
    this._value
      .pipe(
        skip(2),
        takeUntil(this.destroy$),
        throttleTime(1000 / 10, async, { leading: false, trailing: true }),
        distinctUntilChanged()
      )
      .subscribe((value) => {
        this.brightnessControl.setBrightness(value, 'DIRECT');
      });
    // Get current brightness
    this.brightnessControl.brightnessStream
      .pipe(takeUntil(this.destroy$))
      .subscribe((brightness) => {
        this._value.next(brightness ?? this._value.value);
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
  }

  onDragStart = () => {
    if (this.dragging) return;
    this.dragging = true;
  };

  @HostListener('window:mouseup', ['$event'])
  onDragEnd = ($event: MouseEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
  };

  @HostListener('window:mousemove', ['$event'])
  onDrag = ($event: MouseEvent) => {
    if (!this.dragging) return;
    const min =
      this.containerEl?.nativeElement.offsetLeft +
      this.thumbEl?.nativeElement.offsetWidth / 2;
    const max = this.containerEl?.nativeElement.offsetWidth || 0;
    const offset = clamp($event.clientX, min, max);
    this.thumbOffsetStyle = 'calc(' + offset + 'px - 3em)';
    let value =
      ((offset - min) / (max - min)) * (this.maxValue - this.minValue) +
      this.minValue;
    // Handle snapping
    if (Math.abs(value - this.snapValue) < 5) {
      value = this.snapValue;
    }
    this._value.next(Math.round(value));
  };
}
