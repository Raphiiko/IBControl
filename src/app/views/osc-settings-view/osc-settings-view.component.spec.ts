import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OscSettingsViewComponent } from './osc-settings-view.component';

describe('OscSettingsViewComponent', () => {
  let component: OscSettingsViewComponent;
  let fixture: ComponentFixture<OscSettingsViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [OscSettingsViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OscSettingsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
