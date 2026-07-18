import { canonicalSerialize, deepFreeze, ValidationError } from "../../../shared/domain";
import {
  assertAllowedSchemaKeys,
  isPlainSchemaRecord,
  isSafeSchemaPropertyName,
  optionalBoundedInteger,
  optionalFiniteNumber,
  optionalSchemaDescription,
  scalarConstraints,
  utf8ByteLength,
} from "./declarative-schema-helpers";
import {
  type DeclarativeSchemaLimits,
  DEFAULT_DECLARATIVE_SCHEMA_LIMITS,
  type ObjectSchema,
  type SchemaValidationContext,
  type SupportedJsonSchema,
} from "./declarative-schema-types";

function validateSchemaNode(
  input: unknown,
  context: SchemaValidationContext,
  depth: number,
  path: string,
): SupportedJsonSchema {
  if (!isPlainSchemaRecord(input)) {
    throw new ValidationError(`Schema at ${path} must be a plain object.`, path);
  }
  if (depth > context.limits.maxDepth) {
    throw new ValidationError(
      `Schema exceeds the maximum depth of ${context.limits.maxDepth}.`,
      path,
    );
  }
  context.nodes += 1;
  if (context.nodes > context.limits.maxNodes) {
    throw new ValidationError(
      `Schema exceeds the maximum node count of ${context.limits.maxNodes}.`,
      path,
    );
  }

  const description = optionalSchemaDescription(input.description, `${path}.description`);
  const common = description === undefined ? {} : { description };
  switch (input.type) {
    case "string": {
      assertAllowedSchemaKeys(input, new Set(["const", "enum", "maxLength", "minLength"]), path);
      const minLength = optionalBoundedInteger(input.minLength, `${path}.minLength`);
      const maxLength = optionalBoundedInteger(input.maxLength, `${path}.maxLength`);
      if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
        throw new ValidationError(`minLength cannot exceed maxLength at ${path}.`, path);
      }
      return {
        ...common,
        ...scalarConstraints<string>(input, "string", context, path),
        ...(maxLength === undefined ? {} : { maxLength }),
        ...(minLength === undefined ? {} : { minLength }),
        type: "string",
      };
    }
    case "number":
    case "integer": {
      assertAllowedSchemaKeys(input, new Set(["const", "enum", "maximum", "minimum"]), path);
      const minimum = optionalFiniteNumber(
        input.minimum,
        `${path}.minimum`,
        input.type === "integer",
      );
      const maximum = optionalFiniteNumber(
        input.maximum,
        `${path}.maximum`,
        input.type === "integer",
      );
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new ValidationError(`minimum cannot exceed maximum at ${path}.`, path);
      }
      const constraints = scalarConstraints<number>(input, "number", context, path);
      if (
        input.type === "integer" &&
        [constraints.const, ...(constraints.enum ?? [])].some(
          (entry) => entry !== undefined && !Number.isSafeInteger(entry),
        )
      ) {
        throw new ValidationError(`Integer schema values at ${path} must be safe integers.`, path);
      }
      return {
        ...common,
        ...constraints,
        ...(maximum === undefined ? {} : { maximum }),
        ...(minimum === undefined ? {} : { minimum }),
        type: input.type,
      };
    }
    case "boolean":
      assertAllowedSchemaKeys(input, new Set(["const", "enum"]), path);
      return {
        ...common,
        ...scalarConstraints<boolean>(input, "boolean", context, path),
        type: "boolean",
      };
    case "array": {
      assertAllowedSchemaKeys(input, new Set(["items", "maxItems", "minItems"]), path);
      if (input.items === undefined) {
        throw new ValidationError(`Array schema at ${path} requires items.`, path);
      }
      const minItems = optionalBoundedInteger(input.minItems, `${path}.minItems`, 1_000);
      const maxItems = optionalBoundedInteger(input.maxItems, `${path}.maxItems`, 1_000);
      if (minItems !== undefined && maxItems !== undefined && minItems > maxItems) {
        throw new ValidationError(`minItems cannot exceed maxItems at ${path}.`, path);
      }
      return {
        ...common,
        items: validateSchemaNode(input.items, context, depth + 1, `${path}.items`),
        ...(maxItems === undefined ? {} : { maxItems }),
        ...(minItems === undefined ? {} : { minItems }),
        type: "array",
      };
    }
    case "object": {
      assertAllowedSchemaKeys(
        input,
        new Set(["additionalProperties", "properties", "required"]),
        path,
      );
      if (input.additionalProperties !== undefined && input.additionalProperties !== false) {
        throw new ValidationError(
          `additionalProperties at ${path} must be false when provided.`,
          path,
        );
      }
      if (input.properties !== undefined && !isPlainSchemaRecord(input.properties)) {
        throw new ValidationError(`properties at ${path} must be an object.`, path);
      }
      const propertyEntries = Object.entries(input.properties ?? {});
      if (propertyEntries.length > context.limits.maxPropertiesPerObject) {
        throw new ValidationError(
          `Object schema at ${path} exceeds ${context.limits.maxPropertiesPerObject} properties.`,
          path,
        );
      }
      const properties: Record<string, SupportedJsonSchema> = {};
      for (const [propertyName, propertySchema] of propertyEntries) {
        if (!isSafeSchemaPropertyName(propertyName)) {
          throw new ValidationError(`Unsafe property name "${propertyName}" at ${path}.`, path);
        }
        properties[propertyName] = validateSchemaNode(
          propertySchema,
          context,
          depth + 1,
          `${path}.properties.${propertyName}`,
        );
      }
      if (input.required !== undefined && !Array.isArray(input.required)) {
        throw new ValidationError(`required at ${path} must be an array.`, path);
      }
      const required = (input.required ?? []).map((name) => {
        if (typeof name !== "string" || !(name in properties)) {
          throw new ValidationError(
            `Every required name at ${path} must reference a property.`,
            path,
          );
        }
        return name;
      });
      if (new Set(required).size !== required.length) {
        throw new ValidationError(`required at ${path} contains duplicates.`, path);
      }
      return {
        ...common,
        additionalProperties: false,
        properties,
        required,
        type: "object",
      };
    }
    default:
      throw new ValidationError(`Unsupported or missing schema type at ${path}.`, path);
  }
}

export function validateToolInputSchema(
  input: unknown,
  limits: DeclarativeSchemaLimits = DEFAULT_DECLARATIVE_SCHEMA_LIMITS,
): ObjectSchema {
  const context: SchemaValidationContext = { limits, nodes: 0 };
  const schema = validateSchemaNode(input, context, 1, "$schema");
  if (schema.type !== "object") {
    throw new ValidationError("A tool input schema must have object at its root.", "inputSchema");
  }
  if (utf8ByteLength(canonicalSerialize(schema)) > limits.maxBytes) {
    throw new ValidationError(
      `Schema exceeds the maximum canonical size of ${limits.maxBytes} bytes.`,
      "inputSchema",
    );
  }
  return deepFreeze(schema);
}

export {
  type ArraySchema,
  type BooleanSchema,
  type DeclarativeSchemaLimits,
  DEFAULT_DECLARATIVE_SCHEMA_LIMITS,
  type NumberSchema,
  type ObjectSchema,
  type StringSchema,
  type SupportedJsonSchema,
} from "./declarative-schema-types";
