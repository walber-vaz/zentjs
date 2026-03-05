export type MaybePromise<T> = T | Promise<T>;
export type AnyState = Record<string, unknown>;
export type AnyDecorators = Record<string, unknown>;
export type Merge<TBase, TExtra> = Omit<TBase, keyof TExtra> & TExtra;
