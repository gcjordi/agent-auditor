export interface DeclarativeSchemaLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxEnumValues: number;
  readonly maxNodes: number;
  readonly maxPropertiesPerObject: number;
}

export const DEFAULT_DECLARATIVE_SCHEMA_LIMITS: DeclarativeSchemaLimits = Object.freeze({
  maxBytes: 65_536,
  maxDepth: 8,
  maxEnumValues: 50,
  maxNodes: 256,
  maxPropertiesPerObject: 100,
});

interface SchemaCommon {
  readonly description?: string;
}

export interface StringSchema extends SchemaCommon {
  readonly type: "string";
  readonly const?: string;
  readonly enum?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface NumberSchema extends SchemaCommon {
  readonly type: "number" | "integer";
  readonly const?: number;
  readonly enum?: readonly number[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface BooleanSchema extends SchemaCommon {
  readonly type: "boolean";
  readonly const?: boolean;
  readonly enum?: readonly boolean[];
}

export interface ArraySchema extends SchemaCommon {
  readonly type: "array";
  readonly items: SupportedJsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface ObjectSchema extends SchemaCommon {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Readonly<Record<string, SupportedJsonSchema>>;
  readonly required: readonly string[];
}

export type SupportedJsonSchema =
  ArraySchema | BooleanSchema | NumberSchema | ObjectSchema | StringSchema;

export interface SchemaValidationContext {
  readonly limits: DeclarativeSchemaLimits;
  nodes: number;
}

export interface SchemaInputRecord extends Record<string, unknown> {
  readonly additionalProperties?: unknown;
  readonly const?: unknown;
  readonly description?: unknown;
  readonly enum?: unknown;
  readonly items?: unknown;
  readonly maximum?: unknown;
  readonly maxItems?: unknown;
  readonly maxLength?: unknown;
  readonly minimum?: unknown;
  readonly minItems?: unknown;
  readonly minLength?: unknown;
  readonly properties?: unknown;
  readonly required?: unknown;
  readonly type?: unknown;
}
