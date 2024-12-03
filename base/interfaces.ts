export interface ReadonlyJSONObject {
  readonly [key: string]: JSONValue;
}

export interface JSONObject extends ReadonlyJSONObject {
  [key: string]: JSONValue;
}

export type ReadonlyJSONArray = readonly ReadonlyJSONValue[];

export type JSONArray = JSONValue[];

export type ReadonlyJSONValue =
  | string
  | number
  | boolean
  | null
  | ReadonlyJSONArray
  | ReadonlyJSONObject
  | undefined; // For optional fields in interfaces

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONArray
  | JSONObject
  | ReadonlyJSONValue
  | undefined; // For optional fields in interfaces
