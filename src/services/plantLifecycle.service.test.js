//===== (Mocks) ======
jest.mock("../config/db", () => {
  const mockDb = jest.fn();
  mockDb.raw = jest.fn();
  mockDb.transaction = jest.fn();
  return mockDb;
});

jest.mock("./data.service", () => ({
  formatDeviceDataForResponse: jest.fn((row) => row),
}));

jest.mock("./deviceRegistry.service", () => ({
  normalizeDeviceId: jest.fn(),
  registerDevice: jest.fn(),
}));

//===== (Imports) ======
const db = require("../config/db");
const {
  normalizeDeviceId,
  registerDevice,
} = require("./deviceRegistry.service");
const {
  addPlantAccess,
  canManagePlant,
  canViewPlant,
  isPlantOwner,
  removePlantAccess,
  updatePlantAccess,
} = require("./plantAccess.service");
const {
  assignDeviceToPlant,
  removePlantDevice,
} = require("./plantDevice.service");

//===== (createWhereFirstQuery) ======
const createWhereFirstQuery = (result) => {
  const query = {
    where: jest.fn(),
    first: jest.fn().mockResolvedValue(result),
  };
  query.where.mockReturnValue(query);
  return query;
};

//===== (createWhereDeleteQuery) ======
const createWhereDeleteQuery = (deletedCount) => {
  const query = {
    where: jest.fn(),
    del: jest.fn().mockResolvedValue(deletedCount),
  };
  query.where.mockReturnValue(query);
  return query;
};

//===== (createInsertReturningQuery) ======
const createInsertReturningQuery = (rows) => {
  const query = {
    insert: jest.fn(),
    returning: jest.fn().mockResolvedValue(rows),
  };
  query.insert.mockReturnValue(query);
  return query;
};

//===== (Lifecycle Test) ======
beforeEach(() => {
  jest.clearAllMocks();
  db.mockReset();
  db.transaction.mockReset();
  db.raw.mockReset();
  normalizeDeviceId.mockImplementation((deviceId) =>
    String(deviceId || "").trim(),
  );
  registerDevice.mockResolvedValue(undefined);
});

//===== (Authorization Plant) ======
describe("plant access authorization", () => {
  test("viewer dapat melihat tetapi tidak dapat mengelola atau menjadi owner", async () => {
    db
      .mockReturnValueOnce(createWhereFirstQuery({ role: "viewer" }))
      .mockReturnValueOnce(createWhereFirstQuery({ role: "viewer" }))
      .mockReturnValueOnce(createWhereFirstQuery({ role: "viewer" }));

    await expect(canViewPlant(7, 3)).resolves.toBe(true);
    await expect(canManagePlant(7, 3)).resolves.toBe(false);
    await expect(isPlantOwner(7, 3)).resolves.toBe(false);

    expect(db).toHaveBeenNthCalledWith(1, "user_plants");
    expect(db).toHaveBeenNthCalledWith(2, "user_plants");
    expect(db).toHaveBeenNthCalledWith(3, "user_plants");
  });

  test("editor dapat mengelola dan owner dikenali", async () => {
    db
      .mockReturnValueOnce(createWhereFirstQuery({ role: "editor" }))
      .mockReturnValueOnce(createWhereFirstQuery({ role: "owner" }));

    await expect(canManagePlant(8, 3)).resolves.toBe(true);
    await expect(isPlantOwner(9, 3)).resolves.toBe(true);
  });

  test("mencegah perubahan dan penghapusan akses owner", async () => {
    db
      .mockReturnValueOnce(createWhereFirstQuery({ role: "owner" }))
      .mockReturnValueOnce(createWhereFirstQuery({ role: "owner" }));

    await expect(
      updatePlantAccess({ plantId: 3, userId: 9, role: "viewer" }),
    ).rejects.toThrow("Cannot_Modify_Owner");
    await expect(
      removePlantAccess({ plantId: 3, userId: 9 }),
    ).rejects.toThrow("Cannot_Modify_Owner");

    expect(db).toHaveBeenCalledTimes(2);
  });

  test("mencegah penambahan owner kedua sebelum query database", async () => {
    await expect(
      addPlantAccess({ plantId: 3, userId: 10, role: "owner" }),
    ).rejects.toThrow("Cannot_Assign_Owner");

    expect(db).not.toHaveBeenCalled();
  });
});

//===== (Lifecycle Device Plant) ======
describe("plant device lifecycle", () => {
  test("mengembalikan assignment yang sudah ada tanpa insert baru", async () => {
    const existingDevice = {
      id: 31,
      plant_id: 3,
      device_id: "BMS-01",
    };
    const transactionDb = jest
      .fn()
      .mockReturnValue(createWhereFirstQuery(existingDevice));
    db.transaction.mockImplementation((callback) => callback(transactionDb));

    await expect(
      assignDeviceToPlant(" BMS-01 ", 3, 7),
    ).resolves.toEqual(existingDevice);

    expect(registerDevice).toHaveBeenCalledWith("BMS-01");
    expect(transactionDb).toHaveBeenCalledTimes(1);
  });

  test("mendaftarkan assignment baru di dalam transaction", async () => {
    const createdDevice = {
      id: 32,
      plant_id: 3,
      device_id: "BMS-02",
    };
    const lookupQuery = createWhereFirstQuery(undefined);
    const insertQuery = createInsertReturningQuery([createdDevice]);
    const transactionDb = jest
      .fn()
      .mockReturnValueOnce(lookupQuery)
      .mockReturnValueOnce(insertQuery);
    db.transaction.mockImplementation((callback) => callback(transactionDb));

    await expect(
      assignDeviceToPlant("BMS-02", 3, 7),
    ).resolves.toEqual(createdDevice);

    expect(registerDevice).toHaveBeenCalledWith("BMS-02");
    expect(lookupQuery.where).toHaveBeenCalledWith({
      device_id: "BMS-02",
      plant_id: 3,
    });
    expect(insertQuery.insert).toHaveBeenCalledWith({
      device_id: "BMS-02",
      plant_id: 3,
    });
    expect(insertQuery.returning).toHaveBeenCalledWith("*");
  });

  test("menolak device ID kosong sebelum membuka transaction", async () => {
    normalizeDeviceId.mockReturnValue("");

    await expect(assignDeviceToPlant(" ", 3, 7)).rejects.toThrow(
      "Device_ID_Required",
    );

    expect(db.transaction).not.toHaveBeenCalled();
    expect(registerDevice).not.toHaveBeenCalled();
  });

  test("melepas device dan mempertahankan hasil identifier", async () => {
    const deleteQuery = createWhereDeleteQuery(1);
    db.mockReturnValue(deleteQuery);

    await expect(removePlantDevice(" BMS-01 ", 3)).resolves.toEqual({
      plantId: 3,
      deviceId: "BMS-01",
    });

    expect(deleteQuery.where).toHaveBeenCalledWith({
      device_id: "BMS-01",
      plant_id: 3,
    });
  });

  test("memberikan error ketika assignment device tidak ditemukan", async () => {
    db.mockReturnValue(createWhereDeleteQuery(0));

    await expect(removePlantDevice("BMS-99", 3)).rejects.toThrow(
      "Plant_Device_Not_Found",
    );
  });
});
