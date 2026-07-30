//===== (Mocks) ======
jest.mock("../config/db", () => jest.fn());

//===== (Imports) ======
const {
  ACCESS_ROLES,
  getRoleFlags,
  normalizeAccessRole,
} = require("./plantAccess.service");

//===== (normalizeAccessRole) ======
describe("normalizeAccessRole", () => {
  test.each([
    ["owner", ACCESS_ROLES.OWNER],
    ["editor", ACCESS_ROLES.CAN_MANAGE],
    ["can_manage", ACCESS_ROLES.CAN_MANAGE],
    ["manager", ACCESS_ROLES.CAN_MANAGE],
    ["viewer", ACCESS_ROLES.ONLY_VIEW],
    ["only_view", ACCESS_ROLES.ONLY_VIEW],
    ["unknown", ACCESS_ROLES.ONLY_VIEW],
    [null, ACCESS_ROLES.ONLY_VIEW],
  ])("mengubah %p menjadi %p", (input, expected) => {
    expect(normalizeAccessRole(input)).toBe(expected);
  });
});

//===== (getRoleFlags) ======
describe("getRoleFlags", () => {
  test("memberikan semua izin kepada owner", () => {
    expect(getRoleFlags("owner")).toEqual({
      accessRole: "owner",
      canManage: true,
      canEdit: true,
      canAddDatalogger: true,
      canDelete: true,
    });
  });

  test("membatasi viewer ke akses baca", () => {
    expect(getRoleFlags("viewer")).toEqual({
      accessRole: "viewer",
      canManage: false,
      canEdit: false,
      canAddDatalogger: false,
      canDelete: false,
    });
  });
});
