export class CustomError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: string,
  ) {
    super();
  }
}
