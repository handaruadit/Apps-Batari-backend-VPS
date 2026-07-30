//===== (Compatibility Facade) ======
const plantAccessController = require("./plantAccess.controller");
const plantCrudController = require("./plantCrud.controller");
const plantDeviceController = require("./plantDevice.controller");

//===== (Exports) ======
module.exports = {
  ...plantAccessController,
  ...plantCrudController,
  ...plantDeviceController,
};
