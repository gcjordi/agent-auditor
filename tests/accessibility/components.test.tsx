/** @vitest-environment jsdom */

import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";

import { Alert, Button, Input, Select, Textarea } from "@/shared/presentation/components";

describe("accessible component foundation", () => {
  it("has no detectable critical accessibility violations", async () => {
    const { container } = render(
      <main>
        <h1>Create an agent</h1>
        <form>
          <Input hint="A local display name." id="name" label="Name" required />
          <Textarea id="prompt" label="System prompt" required />
          <Select id="mode" label="Audit mode">
            <option>Demo</option>
            <option disabled>Live — not configured</option>
          </Select>
          <Alert>Definitions remain local in Demo Mode.</Alert>
          <Button type="submit">Create agent</Button>
        </form>
      </main>,
    );
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
