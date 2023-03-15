export type OSCValueType = 'int' | 'float' | 'string' | 'bool' | 'unsupported';

export interface OSCValueRaw {
  kind: OSCValueType;
  value: string;
}

export interface OSCMessageRaw {
  address: string;
  values: OSCValueRaw[];
}

export interface OSCValueBase {
  kind: OSCValueType;
}

export type OSCValue =
  | OSCIntValue
  | OSCFloatValue
  | OSCStringValue
  | OSCBoolValue
  | OSCUnsupportedValue;

export interface OSCIntValue extends OSCValueBase {
  kind: 'int';
  value: number;
}

export interface OSCFloatValue extends OSCValueBase {
  kind: 'float';
  value: number;
}

export interface OSCStringValue extends OSCValueBase {
  kind: 'string';
  value: string;
}

export interface OSCBoolValue extends OSCValueBase {
  kind: 'bool';
  value: boolean;
}

export interface OSCUnsupportedValue extends OSCValueBase {
  kind: 'unsupported';
}

export interface OSCMessage {
  address: string;
  values: OSCValue[];
}

export function parseOSCMessage(message: OSCMessageRaw): OSCMessage {
  return {
    address: message.address,
    values: message.values.map(parseOSCValue),
  };
}

export function parseOSCValue(value: OSCValueRaw): OSCValue {
  let parsedValue: unknown;
  switch (value.kind) {
    case 'int':
      parsedValue = parseInt(value.value);
      break;
    case 'float':
      parsedValue = parseFloat(value.value);
      break;
    case 'string':
      parsedValue = value.value;
      break;
    case 'bool':
      parsedValue = value.value === 'true';
      break;
    case 'unsupported':
      parsedValue = undefined;
      break;
  }
  return {
    kind: value.kind,
    value: parsedValue,
  } as OSCValue;
}
