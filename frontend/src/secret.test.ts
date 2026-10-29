import { expect, test } from "vitest";
import { secretFrom } from "./secret";

test("secretFrom reads the secret the address hands over", () => {
  expect(secretFrom("#token=5ec2e7")).toBe("5ec2e7");
  expect(secretFrom("#token=5ec2e7&x=1")).toBe("5ec2e7");
  expect(secretFrom("#x=1&token=5ec2e7")).toBe("5ec2e7");
  expect(secretFrom("#other")).toBeNull();
  expect(secretFrom("#token=")).toBeNull();
  expect(secretFrom("")).toBeNull();
});
