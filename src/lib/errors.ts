export class MedalError extends Error {
  constructor(
    public statusCode: number,
    public errorMessage: string,
  ) {
    super(errorMessage);
  }

  toBody() {
    return { errorMessage: this.errorMessage };
  }
}

export const unauthorized = (message = 'Unauthorized') =>
  new MedalError(401, message);
export const forbidden = (message = 'Forbidden') =>
  new MedalError(403, message);
export const notFound = (message = 'Not Found') => new MedalError(404, message);
export const badRequest = (message: string) => new MedalError(400, message);
export const conflict = (message: string) => new MedalError(409, message);
