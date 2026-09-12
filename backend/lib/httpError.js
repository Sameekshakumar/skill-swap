// Thrown inside a $transaction to roll it back with a specific HTTP status.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sendError = (res, error, fallback) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  res.status(500).json({ error: fallback });
};

module.exports = { HttpError, sendError };
