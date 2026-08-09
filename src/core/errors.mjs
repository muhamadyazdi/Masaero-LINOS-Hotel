export class LinosError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "LinosError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
  }
}

export function asLinosError(error) {
  if (error instanceof LinosError) return error;
  console.error(error);
  return new LinosError(500, "ERR-INTERNAL", "An unexpected server error occurred.");
}
