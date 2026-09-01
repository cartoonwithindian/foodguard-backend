export type ValidationErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return undefined;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) ? undefined : "INVALID";
}

export type PasswordStrength = "weak" | "medium" | "strong" | "none";

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "none";

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return "weak";
  if (score <= 4) return "medium";
  return "strong";
}

export function validateLoginForm(fields: {
  email: string;
  password: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  // TEST MODE: any email/username is accepted; only presence is required.
  if (!fields.email.trim()) {
    errors.email = "REQUIRED";
  }

  if (!fields.password) {
    errors.password = "REQUIRED";
  }

  return errors;
}

export function validateSignupForm(fields: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!fields.name.trim()) {
    errors.name = "REQUIRED";
  }

  if (!fields.email.trim()) {
    errors.email = "REQUIRED";
  } else if (validateEmail(fields.email) === "INVALID") {
    errors.email = "INVALID";
  }

  if (!fields.password) {
    errors.password = "REQUIRED";
  } else if (fields.password.length < 8) {
    errors.password = "MIN_LENGTH";
  }

  if (!fields.confirmPassword) {
    errors.confirmPassword = "REQUIRED";
  } else if (fields.password !== fields.confirmPassword) {
    errors.confirmPassword = "MISMATCH";
  }

  return errors;
}
