import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { canonicalSerialize } from "@/shared/domain";

const propertyParameters = { numRuns: 100, seed: 20_260_718 } as const;

describe("canonical serialization properties", () => {
  test.prop(
    [
      fc.uniqueArray(fc.tuple(fc.string({ maxLength: 20 }), fc.jsonValue()), {
        maxLength: 20,
        selector: ([key]) => key,
      }),
    ],
    propertyParameters,
  )("is independent of plain-object insertion order", (entries) => {
    const forward = Object.fromEntries(entries);
    const reverse = Object.fromEntries([...entries].reverse());

    expect(canonicalSerialize(reverse)).toBe(canonicalSerialize(forward));
  });

  test.prop([fc.jsonValue(), fc.jsonValue()], propertyParameters)(
    "preserves array order whenever the ordered values differ canonically",
    (left, right) => {
      fc.pre(canonicalSerialize(left) !== canonicalSerialize(right));

      expect(canonicalSerialize([left, right])).not.toBe(canonicalSerialize([right, left]));
    },
  );
});
