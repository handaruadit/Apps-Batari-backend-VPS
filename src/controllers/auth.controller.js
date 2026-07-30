//===== (Compatibility Facade) ======
const authSessionController = require("./authSession.controller");
const passwordResetController = require("./passwordReset.controller");

//===== (Exports) ======
module.exports = {
  ...authSessionController,
  ...passwordResetController,
};
