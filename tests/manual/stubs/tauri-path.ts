export const sep = () => '/';
export const homeDir = async () => '/home';
export const isAbsolute = (p: string) => p.startsWith('/');
export const basename = (p: string) => p.split('/').pop() ?? p;
export const extname = () => '';
export const join = (...parts: string[]) => parts.join('/');
