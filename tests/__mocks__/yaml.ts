/**
 * Mock for the yaml module
 */

const actualYaml: typeof import("yaml") = jest.requireActual("yaml");

export const parse = jest.fn((input: string) => actualYaml.parse(input));

export const stringify = jest.fn((obj: any) => actualYaml.stringify(obj));

export default {
  parse,
  stringify
};
