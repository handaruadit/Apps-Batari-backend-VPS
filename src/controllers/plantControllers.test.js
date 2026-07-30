//===== (Mock Plant Services) ======
jest.mock("../services/plantAccess.service", () => ({
  addPlantAccess: jest.fn(),
  assignUserToPlant: jest.fn(),
  canManagePlant: jest.fn(),
  canViewPlant: jest.fn(),
  getPlantAccessList: jest.fn(),
  isPlantOwner: jest.fn(),
  removePlantAccess: jest.fn(),
  searchRegisteredUsers: jest.fn(),
  updatePlantAccess: jest.fn(),
}));

jest.mock("../services/plantCrud.service", () => ({
  create: jest.fn(),
  deletePlant: jest.fn(),
  getPlantById: jest.fn(),
  getPlants: jest.fn(),
  updatePlant: jest.fn(),
}));

jest.mock("../services/plantDevice.service", () => ({
  assignDeviceToPlant: jest.fn(),
  getPlantDevices: jest.fn(),
  removePlantDevice: jest.fn(),
}));

//===== (Imports) ======
const {
  addDeviceToPlant,
  addPlantAccessUser,
  assignUserToPlantByEmail,
  createPlant,
  deletePlantData,
  getPlantAccessData,
  getPlantData,
  getPlantDeviceData,
  removeDeviceFromPlant,
  removePlantAccessUser,
  searchPlantAccessUsers,
  updatePlantAccessUser,
  updatePlantData,
} = require("./plant.controller");
const {
  addPlantAccess,
  assignUserToPlant,
  canManagePlant,
  canViewPlant,
  getPlantAccessList,
  isPlantOwner,
  removePlantAccess,
  searchRegisteredUsers,
  updatePlantAccess,
} = require("../services/plantAccess.service");
const {
  create,
  deletePlant,
  getPlantById,
  getPlants,
  updatePlant,
} = require("../services/plantCrud.service");
const {
  assignDeviceToPlant,
  getPlantDevices,
  removePlantDevice,
} = require("../services/plantDevice.service");

//===== (Controller Test Helpers) ======
const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const callController = async (
  controller,
  {
    body = {},
    params = {},
    user = { userId: 10, role: "user" },
  } = {},
) => {
  const req = { body, params, user };
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

const validPlantPayload = {
  name: "Plant Utama",
  location: "Jakarta",
  latitude: -6.2,
  longitude: 106.8,
  system_type: "hybrid",
  pv_capacity: 10,
  currency: "IDR",
};

//===== (Plant Controller Contracts) ======
describe("plant controller contracts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canManagePlant.mockResolvedValue(true);
    canViewPlant.mockResolvedValue(true);
    isPlantOwner.mockResolvedValue(true);
  });

  //===== (Plant CRUD Contracts) ======
  describe("plant CRUD", () => {
    test("creates a plant with the existing response shape", async () => {
      const plant = { id: 5, ...validPlantPayload };
      create.mockResolvedValue([plant]);

      const res = await callController(createPlant, {
        body: validPlantPayload,
      });

      expect(create).toHaveBeenCalledWith(validPlantPayload, 10);
      expectResponse(res, 200, {
        status: "success",
        data: plant,
      });
    });

    test("keeps create validation errors", async () => {
      const res = await callController(createPlant, {
        body: {
          ...validPlantPayload,
          name: "",
        },
      });

      expect(create).not.toHaveBeenCalled();
      expectResponse(res, 400, {
        message: "name is required",
      });
    });

    test("keeps create service errors", async () => {
      create.mockRejectedValue(new Error("Insert failed"));

      const res = await callController(createPlant, {
        body: validPlantPayload,
      });

      expectResponse(res, 500, {
        message: "Insert failed",
      });
    });

    test("updates a manageable plant", async () => {
      updatePlant.mockResolvedValue(1);
      const body = { name: "Plant Baru" };

      const res = await callController(updatePlantData, {
        body,
        params: { id: "5" },
      });

      expect(canManagePlant).toHaveBeenCalledWith(10, "5");
      expect(updatePlant).toHaveBeenCalledWith("5", body);
      expectResponse(res, 200, {
        status: "updated",
      });
    });

    test("returns 403 when updating without manage access", async () => {
      canManagePlant.mockResolvedValue(false);

      const res = await callController(updatePlantData, {
        body: { name: "Plant Baru" },
        params: { id: "5" },
      });

      expect(updatePlant).not.toHaveBeenCalled();
      expectResponse(res, 403, {
        message: "Access denied",
      });
    });

    test("deletes a plant only for its owner", async () => {
      deletePlant.mockResolvedValue(1);

      const res = await callController(deletePlantData, {
        params: { id: "5" },
      });

      expect(isPlantOwner).toHaveBeenCalledWith(10, "5");
      expect(deletePlant).toHaveBeenCalledWith("5");
      expectResponse(res, 200, {
        status: "deleted",
      });
    });

    test("returns 403 when a non-owner deletes a plant", async () => {
      isPlantOwner.mockResolvedValue(false);

      const res = await callController(deletePlantData, {
        params: { id: "5" },
      });

      expect(deletePlant).not.toHaveBeenCalled();
      expectResponse(res, 403, {
        message: "Only owner can delete plant",
      });
    });

    test("returns the existing plant list shape", async () => {
      const plants = [{ id: 5, name: "Plant Utama" }];
      getPlants.mockResolvedValue(plants);

      const res = await callController(getPlantData);

      expect(getPlants).toHaveBeenCalledWith(10);
      expectResponse(res, 200, {
        status: "success",
        data: plants,
      });
    });
  });

  //===== (Plant Device Contracts) ======
  describe("plant devices", () => {
    test("assigns a device using a route plant id", async () => {
      const device = {
        id: 3,
        plant_id: 5,
        device_id: "INV-001",
      };
      assignDeviceToPlant.mockResolvedValue(device);

      const res = await callController(addDeviceToPlant, {
        body: { deviceId: "INV-001" },
        params: { id: "5" },
      });

      expect(canManagePlant).toHaveBeenCalledWith(10, "5");
      expect(assignDeviceToPlant).toHaveBeenCalledWith("INV-001", "5", 10);
      expectResponse(res, 200, {
        status: "device added",
        data: device,
      });
    });

    test("keeps device validation errors", async () => {
      const res = await callController(addDeviceToPlant, {
        params: { id: "5" },
      });

      expect(canManagePlant).not.toHaveBeenCalled();
      expect(assignDeviceToPlant).not.toHaveBeenCalled();
      expectResponse(res, 400, {
        message: "deviceId is required",
      });
    });

    test("returns 403 when assigning without manage access", async () => {
      canManagePlant.mockResolvedValue(false);

      const res = await callController(addDeviceToPlant, {
        body: { deviceId: "INV-001" },
        params: { id: "5" },
      });

      expect(assignDeviceToPlant).not.toHaveBeenCalled();
      expectResponse(res, 403, {
        message: "Access denied",
      });
    });

    test("keeps the normalized empty-device service response", async () => {
      assignDeviceToPlant.mockRejectedValue(new Error("Device_ID_Required"));

      const res = await callController(addDeviceToPlant, {
        body: { deviceId: " " },
        params: { id: "5" },
      });

      expectResponse(res, 400, {
        message: "Device ID tidak boleh kosong",
      });
    });

    test("returns plant details and devices using the existing shape", async () => {
      const plant = {
        id: 5,
        name: "Plant Utama",
        location: "Jakarta",
      };
      const devices = [{ device_id: "INV-001", latestData: [] }];
      getPlantById.mockResolvedValue(plant);
      getPlantDevices.mockResolvedValue(devices);

      const res = await callController(getPlantDeviceData, {
        params: { id: "5" },
      });

      expect(canViewPlant).toHaveBeenCalledWith(10, "5");
      expectResponse(res, 200, {
        status: "success",
        data: {
          plant,
          devices,
        },
      });
    });

    test("returns 403 when reading devices without view access", async () => {
      canViewPlant.mockResolvedValue(false);

      const res = await callController(getPlantDeviceData, {
        params: { id: "5" },
      });

      expect(getPlantDevices).not.toHaveBeenCalled();
      expectResponse(res, 403, {
        message: "Access denied",
      });
    });

    test("removes a device using the existing response shape", async () => {
      removePlantDevice.mockResolvedValue({
        plantId: "5",
        deviceId: "INV-001",
      });

      const res = await callController(removeDeviceFromPlant, {
        params: { id: "5", deviceId: "INV-001" },
      });

      expect(removePlantDevice).toHaveBeenCalledWith("INV-001", "5");
      expectResponse(res, 200, {
        message: "Device berhasil dilepas dari plant.",
        plantId: "5",
        deviceId: "INV-001",
      });
    });

    test("returns 404 when the device is not assigned to the plant", async () => {
      removePlantDevice.mockRejectedValue(
        new Error("Plant_Device_Not_Found"),
      );

      const res = await callController(removeDeviceFromPlant, {
        params: { id: "5", deviceId: "INV-404" },
      });

      expectResponse(res, 404, {
        message: "Device tidak ditemukan pada plant ini.",
      });
    });

    test("keeps unexpected device-service errors", async () => {
      removePlantDevice.mockRejectedValue(new Error("Delete failed"));

      const res = await callController(removeDeviceFromPlant, {
        params: { id: "5", deviceId: "INV-001" },
      });

      expectResponse(res, 500, {
        message: "Delete failed",
      });
    });
  });

  //===== (Plant Access Contracts) ======
  describe("plant access", () => {
    test("keeps the legacy assignment success response", async () => {
      assignUserToPlant.mockResolvedValue(1);
      const body = {
        plant_id: "5",
        email: "viewer@example.com",
        role: "viewer",
      };

      const res = await callController(assignUserToPlantByEmail, { body });

      expect(assignUserToPlant).toHaveBeenCalledWith(
        body.email,
        body.plant_id,
        body.role,
      );
      expectResponse(res, 200, {
        status: "user assigned",
        email: body.email,
      });
    });

    test("keeps legacy assignment validation", async () => {
      const res = await callController(assignUserToPlantByEmail, {
        body: {
          plant_id: "5",
          role: "viewer",
        },
      });

      expect(assignUserToPlant).not.toHaveBeenCalled();
      expectResponse(res, 400, {
        message: "email is required",
      });
    });

    test("returns 404 when the legacy assignment user is absent", async () => {
      assignUserToPlant.mockRejectedValue(new Error("User not found"));

      const res = await callController(assignUserToPlantByEmail, {
        body: {
          plant_id: "5",
          email: "missing@example.com",
          role: "viewer",
        },
      });

      expectResponse(res, 404, {
        message: "User not found",
      });
    });

    test("returns the access list to a manager", async () => {
      const users = [
        {
          userId: 20,
          email: "viewer@example.com",
          role: "viewer",
        },
      ];
      getPlantAccessList.mockResolvedValue(users);

      const res = await callController(getPlantAccessData, {
        params: { id: "5" },
      });

      expect(getPlantAccessList).toHaveBeenCalledWith("5");
      expectResponse(res, 200, {
        status: "success",
        data: users,
      });
    });

    test("returns 403 when access management is forbidden", async () => {
      canManagePlant.mockResolvedValue(false);

      const res = await callController(getPlantAccessData, {
        params: { id: "5" },
      });

      expect(getPlantAccessList).not.toHaveBeenCalled();
      expectResponse(res, 403, {
        message: "Access denied",
      });
    });

    test("returns registered-user search results", async () => {
      const users = [
        {
          userId: 20,
          email: "viewer@example.com",
          phone: "6281234567890",
        },
      ];
      searchRegisteredUsers.mockResolvedValue(users);

      const res = await callController(searchPlantAccessUsers, {
        body: { query: "viewer" },
        params: { id: "5" },
      });

      expect(searchRegisteredUsers).toHaveBeenCalledWith({
        query: "viewer",
        excludePlantId: "5",
      });
      expectResponse(res, 200, {
        status: "success",
        data: users,
      });
    });

    test("adds access and returns the refreshed list with status 201", async () => {
      const users = [
        {
          userId: 20,
          email: "viewer@example.com",
          role: "viewer",
        },
      ];
      addPlantAccess.mockResolvedValue({ id: 8 });
      getPlantAccessList.mockResolvedValue(users);

      const res = await callController(addPlantAccessUser, {
        body: { userId: 20 },
        params: { id: "5" },
      });

      expect(addPlantAccess).toHaveBeenCalledWith({
        plantId: "5",
        userId: 20,
        role: "only_view",
      });
      expectResponse(res, 201, {
        status: "success",
        data: users,
      });
    });

    test.each([
      ["User_Not_Found", 404, "User not found"],
      ["Cannot_Assign_Owner", 400, "Owner role cannot be assigned"],
    ])(
      "maps add-access error %s to status %s",
      async (serviceMessage, status, responseMessage) => {
        addPlantAccess.mockRejectedValue(new Error(serviceMessage));

        const res = await callController(addPlantAccessUser, {
          body: { userId: 20, role: "owner" },
          params: { id: "5" },
        });

        expectResponse(res, status, {
          message: responseMessage,
        });
      },
    );

    test("updates access and returns the refreshed list", async () => {
      const users = [
        {
          userId: 20,
          email: "editor@example.com",
          role: "editor",
        },
      ];
      updatePlantAccess.mockResolvedValue({ id: 8 });
      getPlantAccessList.mockResolvedValue(users);

      const res = await callController(updatePlantAccessUser, {
        body: { role: "editor" },
        params: { id: "5", userId: "20" },
      });

      expect(updatePlantAccess).toHaveBeenCalledWith({
        plantId: "5",
        userId: "20",
        role: "editor",
      });
      expectResponse(res, 200, {
        status: "success",
        data: users,
      });
    });

    test.each([
      ["Cannot_Modify_Owner", 400, "Owner access cannot be changed"],
      ["Access_Not_Found", 404, "Access not found"],
    ])(
      "maps update-access error %s to status %s",
      async (serviceMessage, status, responseMessage) => {
        updatePlantAccess.mockRejectedValue(new Error(serviceMessage));

        const res = await callController(updatePlantAccessUser, {
          body: { role: "viewer" },
          params: { id: "5", userId: "20" },
        });

        expectResponse(res, status, {
          message: responseMessage,
        });
      },
    );

    test("removes access and returns the refreshed list", async () => {
      const users = [];
      removePlantAccess.mockResolvedValue(1);
      getPlantAccessList.mockResolvedValue(users);

      const res = await callController(removePlantAccessUser, {
        params: { id: "5", userId: "20" },
      });

      expect(removePlantAccess).toHaveBeenCalledWith({
        plantId: "5",
        userId: "20",
      });
      expectResponse(res, 200, {
        status: "success",
        data: users,
      });
    });

    test.each([
      ["Cannot_Modify_Owner", 400, "Owner access cannot be removed"],
      ["Access_Not_Found", 404, "Access not found"],
    ])(
      "maps remove-access error %s to status %s",
      async (serviceMessage, status, responseMessage) => {
        removePlantAccess.mockRejectedValue(new Error(serviceMessage));

        const res = await callController(removePlantAccessUser, {
          params: { id: "5", userId: "20" },
        });

        expectResponse(res, status, {
          message: responseMessage,
        });
      },
    );

    test("keeps unexpected access-service errors", async () => {
      updatePlantAccess.mockRejectedValue(new Error("Update failed"));

      const res = await callController(updatePlantAccessUser, {
        body: { role: "viewer" },
        params: { id: "5", userId: "20" },
      });

      expectResponse(res, 500, {
        message: "Update failed",
      });
    });
  });
});
