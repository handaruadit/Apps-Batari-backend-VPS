//===== (validateEmail) ======
const validateEmail = (email) => {
  return typeof email === "string" && /^\S+@\S+\.\S+$/.test(email);
};

//===== (validateRegisterData) ======
const validateRegisterData = ({ email, password, phone }) => {
  if (!email) return { status: 400, message: "Email is required" };
  if (!validateEmail(email)) {
    return { status: 422, message: "Invalid email format" };
  }
  if (!password) return { status: 400, message: "Password is required" };
  if (typeof password !== "string" || password.length < 6) {
    return {
      status: 422,
      message: "Password must be at least 6 characters",
    };
  }
  if (phone && typeof phone !== "string") {
    return { status: 422, message: "Invalid phone format" };
  }
  return null;
};

//===== (validateLoginData) ======
const validateLoginData = ({ email, password }) => {
  if (!email) return { status: 400, message: "Email is required" };
  if (!password) return { status: 400, message: "Password is required" };
  return null;
};

//===== (validateEmailData) ======
const validateEmailData = ({ email }) => {
  if (!email) return { status: 400, message: "Email is required" };
  if (!validateEmail(email)) {
    return { status: 422, message: "Invalid email format" };
  }
  return null;
};

//===== (validatePhone) ======
const validatePhone = (phone) => {
  return (
    typeof phone === "string" &&
    /^[+0-9][0-9\s-]{7,18}$/.test(phone.trim())
  );
};

//===== (validateResetIdentityData) ======
const validateResetIdentityData = ({ method = "email", email, phone }) => {
  if (method === "phone") {
    if (!phone) return { status: 400, message: "Phone is required" };
    if (!validatePhone(phone)) {
      return { status: 422, message: "Invalid phone format" };
    }
    return null;
  }

  return validateEmailData({ email });
};

//===== (validateResetCodeData) ======
const validateResetCodeData = ({ method = "email", email, phone, code }) => {
  const identityError = validateResetIdentityData({ method, email, phone });
  if (identityError) return identityError;
  if (!code) return { status: 400, message: "Code is required" };
  if (!/^\d{6}$/.test(String(code))) {
    return { status: 422, message: "Code must be 6 digits" };
  }
  return null;
};

//===== (validateResetPasswordData) ======
const validateResetPasswordData = ({
  method = "email",
  email,
  phone,
  code,
  newPassword,
}) => {
  const codeError = validateResetCodeData({ method, email, phone, code });
  if (codeError) return codeError;
  if (!newPassword) {
    return { status: 400, message: "New password is required" };
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return {
      status: 422,
      message: "Password must be at least 6 characters",
    };
  }
  return null;
};

//===== (Exports) ======
module.exports = {
  validateEmail,
  validateEmailData,
  validateLoginData,
  validatePhone,
  validateRegisterData,
  validateResetCodeData,
  validateResetIdentityData,
  validateResetPasswordData,
};
