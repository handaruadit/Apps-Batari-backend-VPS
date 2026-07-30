//===== (Imports) ======
const authController = require("./controllers/auth.controller");
const dataController = require("./controllers/data.controller");
const plantController = require("./controllers/plant.controller");
const authService = require("./services/auth.service");
const dataService = require("./services/data.service");
const plantService = require("./services/plant.service");

//===== (expectExportKeys) ======
const expectExportKeys = (moduleExports, expectedKeys) => {
  expect(Object.keys(moduleExports).sort()).toEqual([...expectedKeys].sort());
};

//===== (Compatibility Facade Contracts) ======
describe("compatibility facade exports", () => {
  test("keeps data service exports", () => {
    expectExportKeys(dataService, [
      "checkDeviceAccess",
      "formatDeviceDataForResponse",
      "getChartData",
      "getDailyData",
      "getDeviceData",
      "getDeviceIdData",
      "getLatestEnergyData",
      "getLifetimeData",
      "getMonthlyChartData",
      "getMonthlyData",
      "getYearlyChartData",
      "getYearlyData",
      "roundPowerKw",
      "saveBatteryPowerForPlant",
      "saveDeviceData",
    ]);
  });

  test("keeps plant service exports", () => {
    expectExportKeys(plantService, [
      "ACCESS_ROLES",
      "addPlantAccess",
      "assignDeviceToPlant",
      "assignUserToPlant",
      "canManagePlant",
      "canViewPlant",
      "checkPlantAccess",
      "create",
      "deletePlant",
      "getPlantAccessList",
      "getPlantAccessRole",
      "getPlantById",
      "getPlantDevices",
      "getPlants",
      "getRoleFlags",
      "isPlantOwner",
      "removePlantAccess",
      "removePlantDevice",
      "searchRegisteredUsers",
      "updatePlant",
      "updatePlantAccess",
    ]);
  });

  test("keeps auth service exports", () => {
    expectExportKeys(authService, [
      "loginUser",
      "normalizePhoneNumber",
      "registerUser",
      "requestPasswordReset",
      "resetPassword",
      "verifyPasswordResetCode",
    ]);
  });

  test("keeps controller exports", () => {
    expectExportKeys(dataController, [
      "fetchDeviceData",
      "getChart",
      "getDaily",
      "getLifetime",
      "getMonthly",
      "getMonthlyChart",
      "getYearly",
      "getYearlyChart",
      "sendManualPlantData",
    ]);
    expectExportKeys(plantController, [
      "addDeviceToPlant",
      "addPlantAccessUser",
      "assignUserToPlantByEmail",
      "createPlant",
      "deletePlantData",
      "getPlantAccessData",
      "getPlantData",
      "getPlantDeviceData",
      "removeDeviceFromPlant",
      "removePlantAccessUser",
      "searchPlantAccessUsers",
      "updatePlantAccessUser",
      "updatePlantData",
    ]);
    expectExportKeys(authController, [
      "forgotPassword",
      "login",
      "register",
      "updatePassword",
      "verifyResetCode",
    ]);
  });
});
