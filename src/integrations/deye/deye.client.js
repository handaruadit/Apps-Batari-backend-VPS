const axios = require("axios");

let cachedToken = null;
let tokenExpiresAt = 0;

const getConfig = () => ({
  baseURL: process.env.DEYE_BASE_URL,
  appId: process.env.DEYE_APP_ID,
  appSecret: process.env.DEYE_APP_SECRET,
  email: process.env.DEYE_EMAIL,
  password: process.env.DEYE_PASSWORD_SHA256,
  companyId: process.env.DEYE_COMPANY_ID,
  timeout: Number(process.env.DEYE_REQUEST_TIMEOUT || 15000),
});

const validateConfig = (config) => {
  const required = ["baseURL", "appId", "appSecret", "email", "password"];
  const missing = required.filter((key) => !config[key]);

  if (missing.length) {
    throw new Error(`Deye configuration is incomplete: ${missing.join(", ")}`);
  }
  if (!Number.isFinite(config.timeout) || config.timeout <= 0) {
    throw new Error("DEYE_REQUEST_TIMEOUT must be a positive number");
  }
};

const clearTokenCache = () => {
  cachedToken = null;
  tokenExpiresAt = 0;
};

const wrapError = (error, fallback) => {
  const wrapped = new Error(
    error.response?.data?.msg || error.message || fallback,
  );
  wrapped.name = "DeyeApiError";
  wrapped.statusCode = error.response?.status || 502;
  wrapped.retryable = !error.response || error.response.status >= 500;
  return wrapped;
};

const getAccessToken = async (forceRefresh = false) => {
  const config = getConfig();
  validateConfig(config);

  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  try {
    const response = await axios.post(
      `${config.baseURL}/v1.0/account/token`,
      {
        appSecret: config.appSecret,
        email: config.email,
        password: config.password,
        ...(config.companyId ? { companyId: Number(config.companyId) } : {}),
      },
      {
        params: { appId: config.appId },
        timeout: config.timeout,
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response.data?.success || !response.data.accessToken) {
      throw new Error(response.data?.msg || "Deye authentication failed");
    }

    cachedToken = response.data.accessToken;
    tokenExpiresAt = Date.now() + Number(response.data.expiresIn || 3600) * 1000;
    return cachedToken;
  } catch (error) {
    clearTokenCache();
    throw wrapError(error, "Deye authentication failed");
  }
};

const post = async (path, body = {}, allowAuthRetry = true) => {
  const config = getConfig();
  validateConfig(config);

  try {
    const response = await axios.post(`${config.baseURL}${path}`, body, {
      timeout: config.timeout,
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.data?.success) {
      throw new Error(response.data?.msg || `Deye request failed: ${path}`);
    }
    return response.data;
  } catch (error) {
    if (allowAuthRetry && error.response?.status === 401) {
      clearTokenCache();
      await getAccessToken(true);
      return post(path, body, false);
    }
    throw wrapError(error, `Deye request failed: ${path}`);
  }
};

module.exports = {
  clearTokenCache,
  getAccessToken,
  post,
};
