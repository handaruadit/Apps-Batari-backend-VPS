//===== (Mocks) ======
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

//===== (Imports) ======
const { normalizePhoneNumber } = require("./notification.service");

//===== (normalizePhoneNumber) ======
describe("normalizePhoneNumber", () => {
  test.each([
    ["+62 812-3456-7890", "6281234567890"],
    ["0812 3456 7890", "6281234567890"],
    ["6281234567890", "6281234567890"],
    ["+12345", "12345"],
    [null, ""],
  ])("mengubah %p menjadi %p", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });
});
