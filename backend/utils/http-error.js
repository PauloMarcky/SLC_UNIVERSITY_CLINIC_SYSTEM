/** An error the client is allowed to see. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
