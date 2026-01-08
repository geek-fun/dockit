export type CustomErrorData = {
  status: number;
  details: string;
};

export class CustomError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super(details);
    this.name = 'CustomError';
  }
}

export const createCustomError = (status: number, details: string): CustomError =>
  new CustomError(status, details);

export enum ErrorCodes {
  MISSING_GPT_CONFIG = 999,
  OPENAI_CLIENT_ERROR = 1000,
}
