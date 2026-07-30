//===== (Compatibility Facade) ======
const plantAccessService = require("./plantAccess.service");
const plantCrudService = require("./plantCrud.service");
const plantDeviceService = require("./plantDevice.service");

//===== (Exports) ======
module.exports = {
  ACCESS_ROLES: plantAccessService.ACCESS_ROLES,
  addPlantAccess: plantAccessService.addPlantAccess,
  assignDeviceToPlant: plantDeviceService.assignDeviceToPlant,
  assignUserToPlant: plantAccessService.assignUserToPlant,
  canManagePlant: plantAccessService.canManagePlant,
  canViewPlant: plantAccessService.canViewPlant,
  checkPlantAccess: plantAccessService.checkPlantAccess,
  create: plantCrudService.create,
  deletePlant: plantCrudService.deletePlant,
  getPlantAccessList: plantAccessService.getPlantAccessList,
  getPlantAccessRole: plantAccessService.getPlantAccessRole,
  getPlantById: plantCrudService.getPlantById,
  getPlantDevices: plantDeviceService.getPlantDevices,
  getPlants: plantCrudService.getPlants,
  getRoleFlags: plantAccessService.getRoleFlags,
  isPlantOwner: plantAccessService.isPlantOwner,
  removePlantAccess: plantAccessService.removePlantAccess,
  removePlantDevice: plantDeviceService.removePlantDevice,
  searchRegisteredUsers: plantAccessService.searchRegisteredUsers,
  updatePlant: plantCrudService.updatePlant,
  updatePlantAccess: plantAccessService.updatePlantAccess,
};
