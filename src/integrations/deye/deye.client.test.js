jest.mock("axios", () => ({ post: jest.fn() }));

const axios = require("axios");
const deyeClient = require("./deye.client");

describe("deye.client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deyeClient.clearTokenCache();
    Object.assign(process.env, {
      DEYE_BASE_URL: "https://deye.test",
      DEYE_APP_ID: "app-id",
      DEYE_APP_SECRET: "secret",
      DEYE_EMAIL: "test@example.com",
      DEYE_PASSWORD_SHA256: "hash",
      DEYE_REQUEST_TIMEOUT: "1234",
    });
  });

  test("caches authentication token and applies request timeout", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { success: true, accessToken: "token", expiresIn: 3600 } })
      .mockResolvedValueOnce({ data: { success: true, generationPower: 1000 } })
      .mockResolvedValueOnce({ data: { success: true, generationPower: 2000 } });

    await deyeClient.post("/v1.0/station/latest", { stationId: 1 });
    await deyeClient.post("/v1.0/station/latest", { stationId: 1 });

    expect(axios.post).toHaveBeenCalledTimes(3);
    expect(axios.post.mock.calls[1][2]).toMatchObject({ timeout: 1234 });
    expect(axios.post.mock.calls[1][2].headers.Authorization).toBe("Bearer token");
  });

  test("refreshes token once after a 401", async () => {
    axios.post
      .mockResolvedValueOnce({ data: { success: true, accessToken: "old", expiresIn: 3600 } })
      .mockRejectedValueOnce({ response: { status: 401, data: { msg: "expired" } } })
      .mockResolvedValueOnce({ data: { success: true, accessToken: "new", expiresIn: 3600 } })
      .mockResolvedValueOnce({ data: { success: true, value: "ok" } });

    await expect(deyeClient.post("/v1.0/station/latest", {})).resolves.toMatchObject({ value: "ok" });
    expect(axios.post).toHaveBeenCalledTimes(4);
    expect(axios.post.mock.calls[3][2].headers.Authorization).toBe("Bearer new");
  });
});
