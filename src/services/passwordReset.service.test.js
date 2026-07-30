//===== (Mocks) ======
jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock("crypto", () => ({
  randomInt: jest.fn(),
}));

jest.mock("../config/db", () => {
  const mockDb = jest.fn();
  mockDb.fn = {
    now: jest.fn(),
  };
  return mockDb;
});

jest.mock("./notification.service", () => ({
  normalizePhoneNumber: jest.fn(),
  sendResetCodeEmail: jest.fn(),
  sendResetCodeWhatsApp: jest.fn(),
}));

//===== (Imports) ======
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../config/db");
const {
  normalizePhoneNumber,
  sendResetCodeEmail,
  sendResetCodeWhatsApp,
} = require("./notification.service");
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} = require("./passwordReset.service");

//===== (Konstanta Test) ======
const FIXED_NOW = Date.parse("2026-07-30T08:00:00.000Z");
const FUTURE_EXPIRY = new Date(FIXED_NOW + 10 * 60 * 1000);
const EXPIRED_AT = new Date(FIXED_NOW - 1000);
const DB_NOW = "database-now";

//===== (createWhereFirstQuery) ======
const createWhereFirstQuery = (result) => {
  const query = {
    where: jest.fn(),
    first: jest.fn().mockResolvedValue(result),
  };
  query.where.mockReturnValue(query);
  return query;
};

//===== (createRetireCodesQuery) ======
const createRetireCodesQuery = () => {
  const query = {
    where: jest.fn(),
    modify: jest.fn(),
    whereNull: jest.fn(),
    update: jest.fn().mockResolvedValue(1),
  };
  query.where.mockReturnValue(query);
  query.modify.mockImplementation((callback) => {
    callback(query);
    return query;
  });
  query.whereNull.mockReturnValue(query);
  return query;
};

//===== (createInsertQuery) ======
const createInsertQuery = () => ({
  insert: jest.fn().mockResolvedValue([1]),
});

//===== (createLatestResetQuery) ======
const createLatestResetQuery = (result) => {
  const query = {
    where: jest.fn(),
    modify: jest.fn(),
    whereNull: jest.fn(),
    orderBy: jest.fn(),
    first: jest.fn().mockResolvedValue(result),
  };
  query.where.mockReturnValue(query);
  query.modify.mockImplementation((callback) => {
    callback(query);
    return query;
  });
  query.whereNull.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  return query;
};

//===== (createWhereUpdateQuery) ======
const createWhereUpdateQuery = () => {
  const query = {
    where: jest.fn(),
    update: jest.fn().mockResolvedValue(1),
  };
  query.where.mockReturnValue(query);
  return query;
};

//===== (useTableQueries) ======
const useTableQueries = (queriesByTable) => {
  const queues = Object.fromEntries(
    Object.entries(queriesByTable).map(([table, queries]) => [
      table,
      [...queries],
    ]),
  );

  db.mockImplementation((table) => {
    const query = queues[table]?.shift();
    if (!query) {
      throw new Error(`Unexpected query for table: ${table}`);
    }
    return query;
  });
};

//===== (Lifecycle Test) ======
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
  db.fn.now.mockReturnValue(DB_NOW);
  crypto.randomInt.mockReturnValue(42);
  bcrypt.hash.mockResolvedValue("hashed-reset-code");
  normalizePhoneNumber.mockImplementation((phone) =>
    String(phone || "").replace(/^0/, "62"),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

//===== (Request Reset Password) ======
describe("requestPasswordReset", () => {
  test("menyimpan kode email baru dan mengirim notifikasi", async () => {
    const userQuery = createWhereFirstQuery({
      id: 11,
      email: "user@example.com",
    });
    const retireCodesQuery = createRetireCodesQuery();
    const insertCodeQuery = createInsertQuery();
    useTableQueries({
      users: [userQuery],
      password_reset_codes: [retireCodesQuery, insertCodeQuery],
    });

    await requestPasswordReset({ email: "user@example.com" });

    expect(userQuery.where).toHaveBeenCalledWith({
      email: "user@example.com",
    });
    expect(retireCodesQuery.where).toHaveBeenNthCalledWith(1, {
      method: "email",
    });
    expect(retireCodesQuery.where).toHaveBeenNthCalledWith(2, {
      email: "user@example.com",
    });
    expect(retireCodesQuery.whereNull).toHaveBeenCalledWith("used_at");
    expect(retireCodesQuery.update).toHaveBeenCalledWith({
      used_at: DB_NOW,
    });
    expect(insertCodeQuery.insert).toHaveBeenCalledWith({
      user_id: 11,
      email: "user@example.com",
      phone: null,
      method: "email",
      code_hash: "hashed-reset-code",
      expires_at: new Date(FIXED_NOW + 15 * 60 * 1000),
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("000042", 10);
    expect(sendResetCodeEmail).toHaveBeenCalledWith({
      email: "user@example.com",
      code: "000042",
    });
    expect(sendResetCodeWhatsApp).not.toHaveBeenCalled();
  });

  test("menggunakan nomor ternormalisasi untuk reset melalui WhatsApp", async () => {
    const userQuery = createWhereFirstQuery({
      id: 12,
      email: "phone@example.com",
      phone: "628123456789",
    });
    const retireCodesQuery = createRetireCodesQuery();
    const insertCodeQuery = createInsertQuery();
    useTableQueries({
      users: [userQuery],
      password_reset_codes: [retireCodesQuery, insertCodeQuery],
    });

    await requestPasswordReset({
      method: "phone",
      phone: "08123456789",
    });

    expect(normalizePhoneNumber).toHaveBeenCalledWith("08123456789");
    expect(userQuery.where).toHaveBeenCalledWith({
      phone: "628123456789",
    });
    expect(retireCodesQuery.where).toHaveBeenCalledWith({
      phone: "628123456789",
    });
    expect(insertCodeQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "phone@example.com",
        phone: "628123456789",
        method: "phone",
      }),
    );
    expect(sendResetCodeWhatsApp).toHaveBeenCalledWith({
      phone: "628123456789",
      code: "000042",
    });
    expect(sendResetCodeEmail).not.toHaveBeenCalled();
  });

  test("meneruskan kegagalan notification setelah penyimpanan kode", async () => {
    const userQuery = createWhereFirstQuery({
      id: 11,
      email: "user@example.com",
    });
    const retireCodesQuery = createRetireCodesQuery();
    const insertCodeQuery = createInsertQuery();
    useTableQueries({
      users: [userQuery],
      password_reset_codes: [retireCodesQuery, insertCodeQuery],
    });
    sendResetCodeEmail.mockRejectedValue(
      new Error("Email sender is not configured"),
    );

    await expect(
      requestPasswordReset({ email: "user@example.com" }),
    ).rejects.toThrow("Email sender is not configured");

    expect(insertCodeQuery.insert).toHaveBeenCalledTimes(1);
    expect(sendResetCodeEmail).toHaveBeenCalledTimes(1);
  });
});

//===== (Verify Reset Code) ======
describe("verifyPasswordResetCode", () => {
  test("memverifikasi kode aktif yang benar", async () => {
    const latestQuery = createLatestResetQuery({
      id: 21,
      code_hash: "stored-code-hash",
      expires_at: FUTURE_EXPIRY,
    });
    const verifyQuery = createWhereUpdateQuery();
    useTableQueries({
      password_reset_codes: [latestQuery, verifyQuery],
    });
    bcrypt.compare.mockResolvedValue(true);

    await verifyPasswordResetCode({
      email: "user@example.com",
      code: "123456",
    });

    expect(latestQuery.where).toHaveBeenCalledWith({ method: "email" });
    expect(latestQuery.where).toHaveBeenCalledWith({
      email: "user@example.com",
    });
    expect(latestQuery.whereNull).toHaveBeenCalledWith("used_at");
    expect(bcrypt.compare).toHaveBeenCalledWith(
      "123456",
      "stored-code-hash",
    );
    expect(verifyQuery.where).toHaveBeenCalledWith({ id: 21 });
    expect(verifyQuery.update).toHaveBeenCalledWith({
      verified_at: DB_NOW,
    });
  });

  test("menolak kode yang salah tanpa menandainya terverifikasi", async () => {
    const latestQuery = createLatestResetQuery({
      id: 21,
      code_hash: "stored-code-hash",
      expires_at: FUTURE_EXPIRY,
    });
    useTableQueries({
      password_reset_codes: [latestQuery],
    });
    bcrypt.compare.mockResolvedValue(false);

    await expect(
      verifyPasswordResetCode({
        email: "user@example.com",
        code: "999999",
      }),
    ).rejects.toThrow("Invalid or expired code");

    expect(db).toHaveBeenCalledTimes(1);
  });

  test("menolak kode kedaluwarsa sebelum bcrypt compare", async () => {
    const latestQuery = createLatestResetQuery({
      id: 21,
      code_hash: "stored-code-hash",
      expires_at: EXPIRED_AT,
    });
    useTableQueries({
      password_reset_codes: [latestQuery],
    });

    await expect(
      verifyPasswordResetCode({
        email: "user@example.com",
        code: "123456",
      }),
    ).rejects.toThrow("Invalid or expired code");

    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});

//===== (Reset Password) ======
describe("resetPassword", () => {
  test("memperbarui password dan menandai kode sudah digunakan", async () => {
    const latestQuery = createLatestResetQuery({
      id: 21,
      user_id: 11,
      code_hash: "stored-code-hash",
      expires_at: FUTURE_EXPIRY,
      verified_at: new Date(FIXED_NOW - 1000),
    });
    const userUpdateQuery = createWhereUpdateQuery();
    const resetCodeUpdateQuery = createWhereUpdateQuery();
    useTableQueries({
      password_reset_codes: [latestQuery, resetCodeUpdateQuery],
      users: [userUpdateQuery],
    });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue("new-password-hash");

    await resetPassword({
      email: "user@example.com",
      code: "123456",
      newPassword: "new-password",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("new-password", 10);
    expect(userUpdateQuery.where).toHaveBeenCalledWith({ id: 11 });
    expect(userUpdateQuery.update).toHaveBeenCalledWith({
      password: "new-password-hash",
      updated_at: DB_NOW,
    });
    expect(resetCodeUpdateQuery.where).toHaveBeenCalledWith({ id: 21 });
    expect(resetCodeUpdateQuery.update).toHaveBeenCalledWith({
      used_at: DB_NOW,
    });
  });

  test("menolak kode yang sudah digunakan", async () => {
    const latestQuery = createLatestResetQuery(undefined);
    useTableQueries({
      password_reset_codes: [latestQuery],
    });

    await expect(
      resetPassword({
        email: "user@example.com",
        code: "123456",
        newPassword: "new-password",
      }),
    ).rejects.toThrow("Invalid or expired code");

    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
});
