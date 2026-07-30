//===== (Imports) ======
const {
  validateLoginData,
  validateRegisterData,
  validateResetCodeData,
  validateResetIdentityData,
  validateResetPasswordData,
} = require("./auth.validator");

//===== (Validasi Registrasi) ======
describe("validateRegisterData", () => {
  test("menerima data registrasi yang valid", () => {
    expect(
      validateRegisterData({
        email: "user@example.com",
        password: "rahasia",
        phone: "081234567890",
      }),
    ).toBeNull();
  });

  test("mempertahankan pesan validasi email dan password", () => {
    expect(
      validateRegisterData({ email: "invalid", password: "rahasia" }),
    ).toEqual({ status: 422, message: "Invalid email format" });
    expect(
      validateRegisterData({ email: "user@example.com", password: "123" }),
    ).toEqual({
      status: 422,
      message: "Password must be at least 6 characters",
    });
  });
});

//===== (Validasi Login) ======
describe("validateLoginData", () => {
  test("mempertahankan urutan validasi field wajib", () => {
    expect(validateLoginData({})).toEqual({
      status: 400,
      message: "Email is required",
    });
    expect(validateLoginData({ email: "user@example.com" })).toEqual({
      status: 400,
      message: "Password is required",
    });
  });
});

//===== (Validasi Reset Password) ======
describe("password reset validators", () => {
  test("menerima identitas email dan telepon yang valid", () => {
    expect(
      validateResetIdentityData({ email: "user@example.com" }),
    ).toBeNull();
    expect(
      validateResetIdentityData({
        method: "phone",
        phone: "+62 812-3456-7890",
      }),
    ).toBeNull();
  });

  test("mempertahankan validasi kode enam digit", () => {
    expect(
      validateResetCodeData({
        email: "user@example.com",
        code: "12345",
      }),
    ).toEqual({ status: 422, message: "Code must be 6 digits" });
  });

  test("mempertahankan validasi password baru", () => {
    expect(
      validateResetPasswordData({
        email: "user@example.com",
        code: "123456",
        newPassword: "123",
      }),
    ).toEqual({
      status: 422,
      message: "Password must be at least 6 characters",
    });
  });
});
