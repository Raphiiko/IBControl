use serde::{Deserialize, Serialize};

use super::ovrdevice::OVRDevice;

#[derive(Clone, Serialize, Deserialize)]
pub struct DeviceUpdateEvent {
    pub device: OVRDevice,
}
