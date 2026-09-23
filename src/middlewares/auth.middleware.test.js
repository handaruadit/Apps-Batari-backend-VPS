//===== (Mock JWT Configuration) ======
jest.mock("../config/jwt", () => ({
  verifyToken: jest.fn(),
}));

//===== (Imports) ======
const auth = require("./auth.middleware");
const { verifyToken } = require("../config/jwt");

//===== (createResponse) ======
const createResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

//===== (Authentication Middleware Contract) ======
describe("authentication middleware contract", () => {
  beforeEach(() => {
    verifyToken.mockReset();
  });

  test("returns 401 when no token is provided", () => {
    const req = { headers: {} };
    const res = createResponse();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("Authentication required"),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("attaches the decoded user and continues for a valid token", () => {
    const decoded = { id: "user-1", role: "user" };
    verifyToken.mockReturnValue(decoded);
    const req = { headers: { authorization: "Bearer valid-token" } };
    const res = createResponse();
    const next = jest.fn();

    auth(req, res, next);

    expect(verifyToken).toHaveBeenCalledWith("valid-token");
    expect(req.user).toEqual(decoded);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("returns 401 when token verification fails", () => {
    verifyToken.mockImplementation(() => {
      throw new Error("invalid");
    });
    const req = { headers: { authorization: "Bearer invalid-token" } };
    const res = createResponse();
    const next = jest.fn();

    auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: expect.stringContaining("Invalid or expired token"),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
