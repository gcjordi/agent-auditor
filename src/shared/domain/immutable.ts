function freezeValue<Value>(value: Value, seen: WeakSet<object>): Value {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }

  seen.add(value);
  for (const child of Object.values(value)) {
    freezeValue(child, seen);
  }

  return Object.freeze(value);
}

export function deepFreeze<Value>(value: Value): Readonly<Value> {
  return freezeValue(value, new WeakSet<object>());
}
