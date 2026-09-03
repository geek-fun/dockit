export class Resource {
  async close() {}
}
export class Channel {
  onmessage?: (msg: unknown) => void;
}
export const invoke = async () => undefined;
export const convertFileSrc = (p: string) => p;
export const transformCallback = () => 0;
