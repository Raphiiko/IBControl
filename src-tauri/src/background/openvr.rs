use std::{
    ffi::CStr,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use chrono::{naive::NaiveDateTime, Utc};
use log::info;
use openvr::TrackedDeviceIndex;
use openvr_sys::k_pch_SteamVR_Section;
use serde::Serialize;
use substring::Substring;
use sysinfo::SystemExt;
use tauri::Manager;

use crate::{TAURI_WINDOW, models::{ovrdevice::OVRDevice, events::DeviceUpdateEvent}};

#[derive(Serialize, Clone)]
pub enum OpenVRStatus {
    INACTIVE,
    INITIALIZING,
    INITIALIZED,
}

struct OpenVRManagerState {
    active: Mutex<bool>,
    status: Mutex<OpenVRStatus>,
    devices: Mutex<Vec<OVRDevice>>,
    settings: Mutex<Option<openvr::Settings>>,
}

pub struct OpenVRManager {
    state: Arc<OpenVRManagerState>,
}

impl OpenVRManager {
    pub fn new() -> OpenVRManager {
        let state = Arc::new(OpenVRManagerState {
            active: Mutex::new(false),
            status: Mutex::new(OpenVRStatus::INACTIVE),
            devices: Mutex::new(vec![]),
            settings: Mutex::new(None),
        });
        let mut task = OpenVRManagerTask::new(state.clone());
        thread::spawn(move || {
            task.run();
        });
        OpenVRManager { state }
    }

    pub fn get_devices(&self) -> Vec<OVRDevice> {
        let devices = self.state.devices.lock().unwrap();
        devices.clone()
    }

    pub fn get_status(&self) -> OpenVRStatus {
        let status = self.state.status.lock().unwrap();
        status.clone()
    }

    pub fn set_active(&self, active: bool) {
        let mut _active = self.state.active.lock().unwrap();
        *_active = active;
    }

    pub fn get_analog_gain(&self) -> Result<f32, String> {
        let mut devices = self.state.devices.lock().unwrap();
        let device = devices
            .iter_mut()
            .find(|device| device.class == openvr::TrackedDeviceClass::HMD);
        if let Some(_) = device {
            // TODO: CHECK IF HMD SUPPORTS ANALOG GAIN
            let settings = self.state.settings.lock().unwrap();
            if settings.is_some() {
                let analog_gain = settings.as_ref().unwrap().get_float(
                    &CStr::from_bytes_with_nul(k_pch_SteamVR_Section).unwrap(),
                    &CStr::from_bytes_with_nul(b"analogGain\0").unwrap(),
                );
                return match analog_gain {
                    Ok(analog_gain) => Ok(analog_gain),
                    Err(_) => Err("ANALOG_GAIN_NOT_FOUND".to_string()),
                };
            } else {
                return Err("OPENVR_NOT_INITIALISED".to_string());
            }
        } else {
            return Err("NO_HMD_FOUND".to_string());
        }
    }

    pub fn set_analog_gain(&self, analog_gain: f32) -> Result<(), String> {
        let mut devices = self.state.devices.lock().unwrap();
        let device = devices
            .iter_mut()
            .find(|device| device.class == openvr::TrackedDeviceClass::HMD);
        if let Some(_) = device {
            // TODO: CHECK IF HMD SUPPORTS ANALOG GAIN
            let settings = self.state.settings.lock().unwrap();
            if settings.is_some() {
                let _ = settings.as_ref().unwrap().set_float(
                    &CStr::from_bytes_with_nul(k_pch_SteamVR_Section).unwrap(),
                    &CStr::from_bytes_with_nul(b"analogGain\0").unwrap(),
                    analog_gain,
                );
            } else {
                return Err("OPENVR_NOT_INITIALISED".to_string());
            }
            Ok(())
        } else {
            return Err("NO_HMD_FOUND".to_string());
        }
    }
}

struct OpenVRManagerTask {
    state: Arc<OpenVRManagerState>,
}

impl OpenVRManagerTask {
    pub fn new(state: Arc<OpenVRManagerState>) -> OpenVRManagerTask {
        OpenVRManagerTask { state }
    }

    fn run(&mut self) {
        // Thread dependencies
        let mut sysinfo = sysinfo::System::new_all();

        // Thread State
        let mut ovr_active = false;
        let mut ovr_next_init = NaiveDateTime::from_timestamp_millis(0).unwrap();
        let mut ovr_next_device_refresh = NaiveDateTime::from_timestamp_millis(0).unwrap();
        let mut ovr_context: Option<openvr::Context> = None;
        let mut ovr_system: Option<openvr::System> = None;

        // Main Loop
        'ovr_loop: loop {
            thread::sleep(Duration::from_millis(32));
            let state_active = self.state.active.lock().unwrap();
            if *state_active {
                drop(state_active);
                // If we're not active, try to initialize OpenVR
                if let None = ovr_context {
                    // Stop if we cannot yet (re)initialize OpenVR
                    if (Utc::now().naive_utc() - ovr_next_init).num_milliseconds() <= 0 {
                        continue;
                    }
                    // If we need to reinitialize OpenVR after this, wait at least 3 seconds
                    ovr_next_init = Utc::now().naive_utc() + chrono::Duration::seconds(3);
                    // Check if SteamVR is running, snd stop initializing if it's not.
                    sysinfo.refresh_processes();
                    let processes = sysinfo.processes_by_exact_name("vrmonitor.exe");
                    if processes.count() == 0 {
                        self.update_status(OpenVRStatus::INACTIVE);
                        continue;
                    }
                    // Update the status
                    self.update_status(OpenVRStatus::INITIALIZING);
                    // Try to initialize OpenVR
                    unsafe {
                        ovr_context = match openvr::init(openvr::ApplicationType::Background) {
                            Ok(ctx) => Some(ctx),
                            Err(_err) => None,
                        };
                    }
                    // If we failed, continue to try again later
                    if ovr_context.is_none() {
                        continue;
                    }
                    // Obtain the system context
                    ovr_system = match ovr_context.as_mut().unwrap().system() {
                        Ok(sys) => Some(sys),
                        Err(_err) => None,
                    };
                    // If we failed, continue to try again later
                    if ovr_system.is_none() {
                        unsafe {
                            ovr_context.unwrap().shutdown();
                        }
                        ovr_context = None;
                        continue;
                    }
                    // Obtain the settings context
                    let ovr_settings = match ovr_context.as_mut().unwrap().settings() {
                        Ok(set) => Some(set),
                        Err(_err) => None,
                    };
                    // If we failed, continue to try again later
                    if ovr_settings.is_none() {
                        unsafe {
                            ovr_context.unwrap().shutdown();
                        }
                        ovr_context = None;
                        ovr_system = None;
                        continue;
                    }
                    // Set the settings context on the state
                    let mut settings_guard = self.state.settings.lock().unwrap();
                    *settings_guard = ovr_settings;
                    // We've successfully initialized OpenVR
                    info!("[Core] OpenVR Initialized");
                    ovr_active = true;
                    self.update_status(OpenVRStatus::INITIALIZED);
                }
                if let Some(system) = ovr_system.as_mut() {
                    // Refresh all devices when needed
                    if (Utc::now().naive_utc() - ovr_next_device_refresh).num_milliseconds() > 0 {
                        ovr_next_device_refresh =
                            Utc::now().naive_utc() + chrono::Duration::seconds(5);
                        self.update_all_devices(true, system);
                    }
                    // Poll for events
                    while let Some((e, _)) =
                        system.poll_next_event_with_pose(openvr::TrackingUniverseOrigin::Standing)
                    {
                        // Handle Quit event
                        match e.event {
                            openvr::system::event::Event::Quit(_) => {
                                // Shutdown OpenVR
                                info!("[Core] OpenVR is Quitting. Shutting down OpenVR module");
                                ovr_active = false;
                                self.update_status(OpenVRStatus::INACTIVE);
                                unsafe {
                                    ovr_context.unwrap().shutdown();
                                    ovr_context = None;
                                }
                                ovr_system = None;
                                // Schedule next initialization attempt
                                ovr_next_init =
                                    Utc::now().naive_utc() + chrono::Duration::seconds(5);
                                continue 'ovr_loop;
                            }
                            openvr::system::event::Event::TrackedDeviceActivated
                            | openvr::system::event::Event::TrackedDeviceDeactivated => {
                                self.update_device(e.tracked_device_index, true, system);
                            }
                            openvr::system::event::Event::PropertyChanged(prop) => {
                                if match prop.property {
                                    openvr::property::DeviceBatteryPercentage_Float
                                    | openvr::property::DeviceProvidesBatteryStatus_Bool
                                    | openvr::property::DeviceCanPowerOff_Bool
                                    | openvr::property::DeviceIsCharging_Bool
                                    | openvr::property::ConnectedWirelessDongle_String
                                    | openvr::property::SerialNumber_String
                                    | openvr::property::HardwareRevision_String
                                    | openvr::property::ManufacturerName_String
                                    | openvr::property::ModelNumber_String => true,
                                    _ => false,
                                } {
                                    self.update_device(e.tracked_device_index, true, system);
                                }
                            }
                            _ => {}
                        }
                    }
                }
            } else if ovr_active {
                ovr_active = false;
                info!("[Core] Shutting down OpenVR module");
                self.update_status(OpenVRStatus::INACTIVE);
                // Shutdown OpenVR
                if let Some(ctx) = ovr_context {
                    ovr_system = None;
                    unsafe {
                        ctx.shutdown();
                    }
                    ovr_context = None;
                }
            }
        }
    }

    fn update_status(&self, new_status: OpenVRStatus) {
        {
            let mut status = self.state.status.lock().unwrap();
            *status = new_status.clone();
            let status_str = serde_json::to_string(&new_status).unwrap();
            let window_guard = TAURI_WINDOW.lock().unwrap();
            let window = window_guard.as_ref().unwrap();
            window
                .emit_all(
                    "OVR_STATUS_UPDATE",
                    status_str.substring(1, status_str.len() - 1).to_string(),
                )
                .ok();
        }
    }

    fn update_all_devices(&self, emit: bool, system: &openvr::System) {
        for n in 0..openvr::MAX_TRACKED_DEVICE_COUNT {
            self.update_device(n as u32, emit, system);
        }
    }

    fn update_device(&self, device_index: TrackedDeviceIndex, emit: bool, system: &openvr::System) {
        let device = OVRDevice {
            index: device_index,
            class: system.tracked_device_class(device_index),
            battery: system
                .float_tracked_device_property(
                    device_index,
                    openvr::property::DeviceBatteryPercentage_Float,
                )
                .ok(),
            provides_battery_status: system
                .bool_tracked_device_property(
                    device_index,
                    openvr::property::DeviceProvidesBatteryStatus_Bool,
                )
                .ok(),
            can_power_off: system
                .bool_tracked_device_property(
                    device_index,
                    openvr::property::DeviceCanPowerOff_Bool,
                )
                .ok(),
            is_charging: system
                .bool_tracked_device_property(device_index, openvr::property::DeviceIsCharging_Bool)
                .ok(),
            dongle_id: match system
                .string_tracked_device_property(
                    device_index,
                    openvr::property::ConnectedWirelessDongle_String,
                )
                .ok()
            {
                Some(value) => Some(value.into_string().unwrap()),
                None => None,
            },
            serial_number: match system
                .string_tracked_device_property(device_index, openvr::property::SerialNumber_String)
                .ok()
            {
                Some(value) => Some(value.into_string().unwrap()),
                None => None,
            },
            hardware_revision: match system
                .string_tracked_device_property(
                    device_index,
                    openvr::property::HardwareRevision_String,
                )
                .ok()
            {
                Some(value) => Some(value.into_string().unwrap()),
                None => None,
            },
            manufacturer_name: match system
                .string_tracked_device_property(
                    device_index,
                    openvr::property::ManufacturerName_String,
                )
                .ok()
            {
                Some(value) => Some(value.into_string().unwrap()),
                None => None,
            },
            model_number: match system
                .string_tracked_device_property(device_index, openvr::property::ModelNumber_String)
                .ok()
            {
                Some(value) => Some(value.into_string().unwrap()),
                None => None,
            },
        };

        // Add or update device in list
        let mut devices = self.state.devices.lock().unwrap();
        let mut found = false;
        for i in 0..devices.len() {
            if devices[i].index == device_index {
                devices[i] = device.clone();
                found = true;
                break;
            }
        }
        if !found {
            devices.push(device.clone());
        }
        // Send out device update as an event
        if emit {
            let event = DeviceUpdateEvent { device };
            let window_guard = TAURI_WINDOW.lock().unwrap();
            let window = window_guard.as_ref().unwrap();
            window.emit_all("OVR_DEVICE_UPDATE", event).unwrap();
        }
    }
}
