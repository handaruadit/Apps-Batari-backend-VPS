//===== (Mock Auth Services) ======
jest.mock("../services/auth.service", () => ({
  loginUser: jest.fn(),
  registerUser: jest.fn(),
}));

jest.mock("../services/passwordReset.service", () => ({
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  verifyPasswordResetCode: jest.fn(),
}));

//===== (Imports) ======
const {
  forgotPassword,
  login,
  register,
  updatePassword,
  verifyResetCode,
} = require("./auth.controller");
const {
  loginUser,
  registerUser,
} = require("../services/auth.service");
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} = require("../services/passwordReset.service");

//===== (Response Helpers) ======
const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const callController = async (controller, body = {}) => {
  const req = { body };
  const res = createResponse();
  await controller(req, res);
  return res;
};

const expectResponse = (res, status, body) => {
  if (status === 200) {
    expect(res.status).not.toHaveBeenCalled();
  } else {
    expect(res.status).toHaveBeenCalledWith(status);
  }
  expect(res.json).toHaveBeenCalledWith(body);
};

//===== (Authentication Controller Contracts) ======
describe("authentication controller contracts", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  //===== (register) ======
  describe("register", () => {
    const payload = {
      email: "user@example.com",
      password: "rahasia",
      phone: "081234567890",
    };

    test("returns the existing success response and hides the password", async () => {
      registerUser.mockResolvedValue({
        id: 7,
        email: payload.email,
        password: "hashed-password",
        phone: payload.phone,
        role: "user",
      });

      const res = await callController(register, payload);

      expect(registerUser).toHaveBeenCalledWith(payload);
      expectResponse(res, 200, {
        status: "success",
        success: true,
        message: "Account created successfully",
        data: {
          id: 7,
          email: payload.email,
          phone: payload.phone,
          role: "user",
        },
      });
    });

    test("keeps validation status and message", async () => {
      const res = await callController(register, {
        email: "invalid",
        password: "rahasia",
      });

      expect(registerUser).not.toHaveBeenCalled();
      expectResponse(res, 422, {
        status: "error",
        message: "Invalid email format",
      });
    });

    test("returns 409 for an already registered identity", async () => {
      registerUser.mockRejectedValue(new Error("Email already registered"));

      const res = await callController(register, payload);

      expectResponse(res, 409, {
        status: "error",
        message: "Email already registered",
      });
    });

    test("keeps the generic service error response", async () => {
      registerUser.mockRejectedValue(new Error("Database unavailable"));

      const res = await callController(register, payload);

      expectResponse(res, 500, {
        status: "error",
        message: "Database unavailable",
      });
    });
  });

  //===== (login) ======
  describe("login", () => {
    const payload = {
      email: "user@example.com",
      password: "rahasia",
    };

    test("returns the token and user using the existing shape", async () => {
      loginUser.mockResolvedValue({
        token: "signed-token",
        user: {
          id: 7,
          email: payload.email,
          role: "user",
        },
      });

      const res = await callController(login, payload);

      expect(loginUser).toHaveBeenCalledWith(payload);
      expectResponse(res, 200, {
        status: "success",
        token: "signed-token",
        user: {
          id: 7,
          email: payload.email,
          role: "user",
        },
      });
    });

    test("keeps required-field validation", async () => {
      const res = await callController(login, {
        email: payload.email,
      });

      expect(loginUser).not.toHaveBeenCalled();
      expectResponse(res, 400, {
        status: "error",
        message: "Password is required",
      });
    });

    test.each(["User not found", "Wrong password"])(
      "returns 401 for %s",
      async (message) => {
        loginUser.mockRejectedValue(new Error(message));

        const res = await callController(login, payload);

        expectResponse(res, 401, {
          status: "error",
          message,
        });
      },
    );

    test("keeps the generic login error response", async () => {
      loginUser.mockRejectedValue(new Error("Database unavailable"));

      const res = await callController(login, payload);

      expectResponse(res, 500, {
        status: "error",
        message: "Database unavailable",
      });
    });
  });

  //===== (forgotPassword) ======
  describe("forgotPassword", () => {
    const payload = { email: "user@example.com" };
    const failedMessage =
      "Gagal mengirim kode reset password. Silakan coba lagi.";

    test("returns the existing success response", async () => {
      requestPasswordReset.mockResolvedValue();

      const res = await callController(forgotPassword, payload);

      expect(requestPasswordReset).toHaveBeenCalledWith(payload);
      expectResponse(res, 200, {
        status: "success",
        success: true,
        message: "Reset code has been sent",
      });
    });

    test("keeps identity validation", async () => {
      const res = await callController(forgotPassword, {});

      expect(requestPasswordReset).not.toHaveBeenCalled();
      expectResponse(res, 400, {
        status: "error",
        success: false,
        message: "Email is required",
      });
    });

    test("keeps the masked account-not-found response", async () => {
      requestPasswordReset.mockRejectedValue(new Error("Account not found"));

      const res = await callController(forgotPassword, payload);

      expectResponse(res, 404, {
        status: "error",
        success: false,
        message: failedMessage,
      });
    });

    test.each([
      "Email sender is not configured",
      "WhatsApp sender is not configured",
    ])("returns 503 for %s", async (message) => {
      requestPasswordReset.mockRejectedValue(new Error(message));

      const res = await callController(forgotPassword, payload);

      expectResponse(res, 503, {
        status: "error",
        success: false,
        message: failedMessage,
      });
    });

    test("keeps the generic reset-request response", async () => {
      requestPasswordReset.mockRejectedValue(new Error("Provider failed"));

      const res = await callController(forgotPassword, payload);

      expectResponse(res, 500, {
        status: "error",
        success: false,
        message: failedMessage,
      });
    });
  });

  //===== (verifyResetCode) ======
  describe("verifyResetCode", () => {
    const payload = {
      email: "user@example.com",
      code: "123456",
    };
    const failedMessage = "Kode salah atau sudah kedaluwarsa.";

    test("returns the existing success response", async () => {
      verifyPasswordResetCode.mockResolvedValue();

      const res = await callController(verifyResetCode, payload);

      expect(verifyPasswordResetCode).toHaveBeenCalledWith(payload);
      expectResponse(res, 200, {
        status: "success",
        success: true,
        message: "Code verified",
      });
    });

    test("keeps six-digit validation", async () => {
      const res = await callController(verifyResetCode, {
        ...payload,
        code: "12345",
      });

      expect(verifyPasswordResetCode).not.toHaveBeenCalled();
      expectResponse(res, 422, {
        status: "error",
        success: false,
        message: "Code must be 6 digits",
      });
    });

    test("returns 400 for an invalid or expired code", async () => {
      verifyPasswordResetCode.mockRejectedValue(
        new Error("Invalid or expired code"),
      );

      const res = await callController(verifyResetCode, payload);

      expectResponse(res, 400, {
        status: "error",
        success: false,
        message: failedMessage,
      });
    });

    test("keeps the generic verification error response", async () => {
      verifyPasswordResetCode.mockRejectedValue(new Error("Database failed"));

      const res = await callController(verifyResetCode, payload);

      expectResponse(res, 500, {
        status: "error",
        success: false,
        message: failedMessage,
      });
    });
  });

  //===== (updatePassword) ======
  describe("updatePassword", () => {
    const payload = {
      email: "user@example.com",
      code: "123456",
      newPassword: "password-baru",
    };

    test("returns the existing success response", async () => {
      resetPassword.mockResolvedValue();

      const res = await callController(updatePassword, payload);

      expect(resetPassword).toHaveBeenCalledWith(payload);
      expectResponse(res, 200, {
        status: "success",
        success: true,
        message: "Password updated successfully",
      });
    });

    test("keeps new-password validation", async () => {
      const res = await callController(updatePassword, {
        email: payload.email,
        code: payload.code,
      });

      expect(resetPassword).not.toHaveBeenCalled();
      expectResponse(res, 400, {
        status: "error",
        success: false,
        message: "New password is required",
      });
    });

    test("returns 400 for an invalid or expired code", async () => {
      resetPassword.mockRejectedValue(new Error("Invalid or expired code"));

      const res = await callController(updatePassword, payload);

      expectResponse(res, 400, {
        status: "error",
        success: false,
        message: "Kode salah atau sudah kedaluwarsa.",
      });
    });

    test("keeps the generic password-update response", async () => {
      resetPassword.mockRejectedValue(new Error("Database failed"));

      const res = await callController(updatePassword, payload);

      expectResponse(res, 500, {
        status: "error",
        success: false,
        message: "Password gagal diperbarui. Silakan coba lagi.",
      });
    });
  });
});
